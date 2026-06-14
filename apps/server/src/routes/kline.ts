import Router from '@koa/router'

const router = new Router({ prefix: '/api/kline' })

const TUSHARE_API = 'http://api.tushare.pro'
const TOKEN = process.env.TUSHARE_TOKEN ?? ''

interface Bar {
  time: string // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const cache = new Map<string, { bars: Bar[]; name: string | null; fetchedAt: number }>()
const TTL = 60 * 60 * 1000 // 1h

// Normalize a 6-digit A-share code to tushare's ts_code (e.g. 600519 -> 600519.SH)
function toTsCode(code: string): string {
  const c = code.trim().toUpperCase()
  if (/\.(SH|SZ|BJ)$/.test(c)) return c
  if (/^6/.test(c)) return `${c}.SH`
  if (/^(0|3)/.test(c)) return `${c}.SZ`
  if (/^(4|8)/.test(c)) return `${c}.BJ`
  return `${c}.SH`
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

async function tushare(apiName: string, params: Record<string, unknown>, fields: string) {
  const res = await fetch(TUSHARE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name: apiName, token: TOKEN, params, fields }),
  })
  const json = (await res.json()) as {
    code: number
    msg: string | null
    data: { fields: string[]; items: unknown[][] } | null
  }
  if (json.code !== 0) throw new Error(json.msg ?? 'tushare error')
  return json.data
}

router.get('/', async (ctx) => {
  const code = ctx.query.code as string
  const days = Math.min(parseInt((ctx.query.days as string) ?? '250') || 250, 1200)
  if (!code) { ctx.status = 400; ctx.body = { error: 'code required' }; return }
  if (!TOKEN) {
    ctx.status = 500
    ctx.body = { error: 'TUSHARE_TOKEN 未配置，请在 apps/server/.env 中设置' }
    return
  }

  const tsCode = toTsCode(code)
  const cacheKey = `${tsCode}:${days}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    ctx.body = { success: true, code: tsCode, name: cached.name, bars: cached.bars }
    return
  }

  try {
    const end = new Date()
    const start = new Date()
    // Trading days are ~70% of calendar days; pad generously so we get `days` bars
    start.setDate(start.getDate() - Math.ceil(days * 1.7) - 30)

    const data = await tushare(
      'daily',
      { ts_code: tsCode, start_date: fmtDate(start), end_date: fmtDate(end) },
      'trade_date,open,high,low,close,vol'
    )

    const fields = data?.fields ?? []
    const items = data?.items ?? []
    const idx = (f: string) => fields.indexOf(f)
    const ti = idx('trade_date'), oi = idx('open'), hi = idx('high'),
      li = idx('low'), ci = idx('close'), vi = idx('vol')

    const bars: Bar[] = items
      .map((it) => ({
        time: String(it[ti]).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        open: Number(it[oi]),
        high: Number(it[hi]),
        low: Number(it[li]),
        close: Number(it[ci]),
        volume: Number(it[vi]),
      }))
      .sort((a, b) => (a.time < b.time ? -1 : 1))
      .slice(-days)

    // Best-effort stock name lookup (non-fatal)
    let name: string | null = null
    try {
      const info = await tushare('stock_basic', { ts_code: tsCode }, 'name')
      name = (info?.items?.[0]?.[0] as string) ?? null
    } catch { /* name is optional */ }

    cache.set(cacheKey, { bars, name, fetchedAt: Date.now() })
    ctx.body = { success: true, code: tsCode, name, bars }
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: err instanceof Error ? err.message : 'tushare 请求失败' }
  }
})

export default router
