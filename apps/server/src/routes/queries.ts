import Router from '@koa/router'
import { z } from 'zod'
import { pool } from '../db/pool'
import { saveResponse } from '../services/responseService'

const router = new Router({ prefix: '/api/queries' })

const CreateQuerySchema = z.object({
  question: z.string().min(1).max(2000),
  stockCode: z.string().optional(),
  provider: z.enum(['deepseek', 'doubao', 'kimi', 'tongyi']).default('deepseek'),
})

// POST /api/queries — create query (extension polls for it)
router.post('/', async (ctx) => {
  const body = CreateQuerySchema.parse(ctx.request.body)

  let stockId: number | null = null
  if (body.stockCode) {
    const res = await pool.query('SELECT id FROM stocks WHERE code = $1', [body.stockCode])
    if (res.rows.length > 0) stockId = res.rows[0].id
  }

  const result = await pool.query(
    `INSERT INTO queries (stock_id, stock_code, question, provider, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [stockId, body.stockCode ?? null, body.question, body.provider]
  )
  ctx.body = { success: true, query: result.rows[0] }
})

// GET /api/queries/:id — get single query
router.get('/:id(\\d+)', async (ctx) => {
  const { rows } = await pool.query(`SELECT * FROM queries WHERE id = $1`, [ctx.params.id])
  if (rows.length === 0) { ctx.status = 404; ctx.body = { error: 'Not found' }; return }
  ctx.body = { success: true, query: rows[0] }
})

// POST /api/queries/reset-running — reset stuck 'running' queries back to 'pending' on extension restart
router.post('/reset-running', async (ctx) => {
  const { rows } = await pool.query(
    `UPDATE queries SET status = 'pending', completed_at = NULL
     WHERE status = 'running'
     RETURNING id`
  )
  ctx.body = { success: true, reset: rows.map(r => r.id) }
})

// POST /api/queries/claim — atomically claim ONE pending query (prevents double-dispatch)
router.post('/claim', async (ctx) => {
  const { rows } = await pool.query(
    `UPDATE queries SET status = 'running'
     WHERE id = (SELECT id FROM queries WHERE status = 'pending' ORDER BY created_at LIMIT 1)
     RETURNING *`
  )
  if (rows.length === 0) { ctx.body = { success: true, query: null }; return }
  ctx.body = { success: true, query: rows[0] }
})

// DELETE /api/queries/:id
router.delete('/:id(\\d+)', async (ctx) => {
  await pool.query(`DELETE FROM queries WHERE id = $1`, [ctx.params.id])
  ctx.body = { success: true }
})

// PATCH /api/queries/:id/status — extension updates query status
router.patch('/:id/status', async (ctx) => {
  const { status } = ctx.request.body as { status: string }
  const valid = ['pending', 'running', 'completed', 'failed']
  if (!valid.includes(status)) { ctx.status = 400; ctx.body = { error: 'Invalid status' }; return }
  await pool.query(
    `UPDATE queries SET status = $1, completed_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE NULL END WHERE id = $2`,
    [status, ctx.params.id]
  )
  ctx.body = { success: true }
})

// POST /api/queries/:id/callback — content script posts captured HTML directly
router.post('/:id/callback', async (ctx) => {
  const { html } = ctx.request.body as { html: string }
  if (!html) { ctx.status = 400; ctx.body = { error: 'html required' }; return }
  await saveResponse(parseInt(ctx.params.id), html)
  ctx.body = { success: true }
})

// GET /api/queries — list with optional filters
router.get('/', async (ctx) => {
  const { stockCode, status, page = '1', pageSize = '20' } = ctx.query as Record<string, string>
  const offset = (parseInt(page) - 1) * parseInt(pageSize)
  const conditions: string[] = []
  const params: unknown[] = []

  if (stockCode) { params.push(stockCode); conditions.push(`q.stock_code = $${params.length}`) }
  if (status) { params.push(status); conditions.push(`q.status = $${params.length}`) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(parseInt(pageSize), offset)

  const { rows } = await pool.query(
    `SELECT q.*, r.id as response_id FROM queries q
     LEFT JOIN responses r ON r.query_id = q.id
     ${where} ORDER BY q.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  ctx.body = { success: true, data: rows }
})

// GET /api/queries/:id/response — fetch response in a given format
router.get('/:id/response', async (ctx) => {
  const { format = 'markdown' } = ctx.query as { format?: string }
  const { rows } = await pool.query(
    `SELECT r.*, q.question, q.stock_code FROM responses r
     JOIN queries q ON q.id = r.query_id WHERE r.query_id = $1`,
    [ctx.params.id]
  )
  if (rows.length === 0) { ctx.status = 404; ctx.body = { error: 'Not found' }; return }

  const row = rows[0]
  ctx.body = {
    success: true,
    format,
    content: format === 'html' ? row.raw_html : row.markdown,
    meta: { question: row.question, stockCode: row.stock_code, createdAt: row.created_at },
  }
})

// ── Extension debug endpoints (in-memory) ────────────────────────────────────
const extDebug: { version: string | null; lastSeen: number; logs: string[] } = {
  version: null, lastSeen: 0, logs: [],
}

router.post('/ext/log', async (ctx) => {
  const { version, message } = ctx.request.body as { version?: string; message?: string }
  if (version) { extDebug.version = version; extDebug.lastSeen = Date.now() }
  if (message) {
    extDebug.logs.push(`${new Date().toISOString()} ${message}`)
    if (extDebug.logs.length > 200) extDebug.logs.shift()
  }
  ctx.body = { success: true }
})

router.get('/ext/debug', async (ctx) => {
  ctx.body = { success: true, ...extDebug, ageSec: extDebug.lastSeen ? (Date.now() - extDebug.lastSeen) / 1000 : null }
})

export default router
