import TurndownService from 'turndown'
import { pool } from '../db/pool'
import { lookupStockName } from './stockInfo'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})

// 6→SH, 0/3→SZ; BJ (4/8) is folded to SZ since stocks.market only allows SH/SZ
function marketOf(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') ? 'SH' : 'SZ'
}

// Extract the primary "name(code)" pair from response text.
// Matches 贵州茅台（600519） / 贵州茅台(600519) and picks the most-mentioned code.
function extractStock(text: string): { code: string; name: string } | null {
  // A-share names are 2–4 chars; capping at 4 anchors to the name adjacent to
  // the paren rather than greedily swallowing the preceding sentence.
  const re = /([一-龥A-Za-z*]{2,4})\s*[（(]\s*(\d{6})\s*[)）]/g
  const counts = new Map<string, { name: string; n: number }>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim()
    const code = m[2]
    const cur = counts.get(code)
    if (cur) cur.n += 1
    else counts.set(code, { name, n: 1 })
  }
  if (counts.size === 0) return null
  let best: { code: string; name: string; n: number } | null = null
  for (const [code, v] of counts) {
    if (!best || v.n > best.n) best = { code, name: v.name, n: v.n }
  }
  return best ? { code: best.code, name: best.name } : null
}

// Auto-register the stock referenced by a query into the stocks table.
// Prefers the code the user supplied; otherwise extracts name(code) from the response.
async function autoRegisterStock(queryId: number, markdown: string) {
  const { rows } = await pool.query(
    `SELECT stock_code, kind FROM queries WHERE id = $1`,
    [queryId]
  )
  // 通用问答(general) 的回答不应被当作股票登记到自选股。
  if (rows[0]?.kind === 'general') return
  const providedCode: string | null = rows[0]?.stock_code ?? null

  const extracted = extractStock(markdown)
  if (!extracted && !providedCode) return

  const code = providedCode ?? extracted!.code
  if (!/^\d{6}$/.test(code)) return

  // tushare is the authoritative source; regex-extracted name is an untrusted
  // fallback (AI responses can mention a wrong name next to a code).
  const authName = await lookupStockName(code)  // null when rate-limited / offline
  const fallbackName = extracted?.name ?? null

  // A fresh query bumps the stock to the top of the sidebar.
  const top = `(SELECT COALESCE(MIN(sort_order), 1) - 1 FROM stocks)`

  if (authName) {
    // We have a verified name — always write it, correcting any prior wrong value.
    await pool.query(
      `INSERT INTO stocks (code, name, market, sort_order) VALUES ($1, $2, $3, ${top})
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = ${top}`,
      [code, authName, marketOf(code)]
    )
  } else {
    // tushare unavailable: only set name on first INSERT (stock not yet in DB).
    // On conflict keep the existing DB name — it may already be correct from a
    // previous successful tushare lookup; overwriting with an AI-extracted name
    // risks introducing errors like "于芯源微" instead of "芯源微".
    const insertName = fallbackName ?? code
    await pool.query(
      `INSERT INTO stocks (code, name, market, sort_order) VALUES ($1, $2, $3, ${top})
       ON CONFLICT (code) DO UPDATE SET sort_order = ${top}`,
      [code, insertName, marketOf(code)]
    )
  }
}

export async function saveResponse(queryId: number, rawHtml: string) {
  const markdown = turndown.turndown(rawHtml)

  await pool.query(
    `INSERT INTO responses (query_id, raw_html, markdown, provider)
     SELECT $1, $2, $3, provider FROM queries WHERE id = $1`,
    [queryId, rawHtml, markdown]
  )

  // Register the stock BEFORE marking the query completed. The frontend reloads
  // the sidebar as soon as it sees 'completed', so the stock must already exist
  // to avoid a race where the reload happens before registration (this only bit
  // the code-only case, since name-provided queries pre-register on submit).
  try {
    await autoRegisterStock(queryId, markdown)
  } catch {
    /* extraction is optional */
  }

  await pool.query(
    `UPDATE queries SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [queryId]
  )
}
