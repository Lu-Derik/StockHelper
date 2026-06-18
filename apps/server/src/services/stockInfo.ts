// Authoritative A-share name lookup by 6-digit code.
//
// tushare's stock_basic interface is rate-limited (free tier: ~1 call/hour),
// so we CANNOT look up names per-stock at query time. Instead we fetch the
// WHOLE market list in a single call (stock_basic with no ts_code returns every
// symbol→name) and cache it in memory. Subsequent lookups are local & instant.
//
// This avoids guessing the name from response text, where a regex can't tell
// where a 2–4 char Chinese name begins (e.g. "于芯源微" vs "芯源微").
const TUSHARE_API = 'http://api.tushare.pro'
const TOKEN = process.env.TUSHARE_TOKEN ?? ''
const TTL = 12 * 60 * 60 * 1000 // refresh the full list at most twice a day

let codeToName = new Map<string, string>()
let fetchedAt = 0
let inflight: Promise<void> | null = null

async function refreshAll(): Promise<void> {
  if (!TOKEN) return
  const res = await fetch(TUSHARE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No ts_code → returns the entire listed-stock universe in one call.
    body: JSON.stringify({
      api_name: 'stock_basic',
      token: TOKEN,
      params: { list_status: 'L' },
      fields: 'symbol,name',
    }),
  })
  const json = (await res.json()) as {
    code: number
    data: { fields: string[]; items: unknown[][] } | null
  }
  if (json.code !== 0 || !json.data) return // rate-limited / error → keep old cache
  const fi = json.data.fields
  const si = fi.indexOf('symbol')
  const ni = fi.indexOf('name')
  const next = new Map<string, string>()
  for (const row of json.data.items) {
    const sym = String(row[si]).padStart(6, '0')
    const name = String(row[ni])
    if (/^\d{6}$/.test(sym) && name) next.set(sym, name)
  }
  if (next.size > 0) {
    codeToName = next
    fetchedAt = Date.now()
  }
}

async function ensureLoaded(): Promise<void> {
  if (codeToName.size > 0 && Date.now() - fetchedAt < TTL) return
  if (!inflight) {
    inflight = refreshAll().finally(() => { inflight = null })
  }
  await inflight
}

// Returns the official stock name, or null if unknown / unavailable.
export async function lookupStockName(code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null
  try {
    await ensureLoaded()
  } catch {
    /* network/rate-limit → fall back to whatever cache we have */
  }
  return codeToName.get(code) ?? null
}
