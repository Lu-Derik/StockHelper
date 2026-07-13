import Router from '@koa/router'
import { z } from 'zod'
import { pool } from '../db/pool'
import { saveResponse } from '../services/responseService'

const router = new Router({ prefix: '/api/queries' })

const CreateQuerySchema = z.object({
  question: z.string().min(1).max(2000),
  stockCode: z.string().optional(),
  provider: z.enum(['deepseek', 'doubao', 'kimi', 'tongyi']).default('deepseek'),
  executionMode: z.enum(['app', 'backend']).default('backend'),
  kind: z.enum(['stock', 'general']).default('stock'),
})

// Derive a short sidebar title from the question text (first line, truncated).
function titleFromQuestion(question: string): string {
  const firstLine = question.replace(/\s+/g, ' ').trim()
  return firstLine.length > 20 ? firstLine.slice(0, 20) + '…' : firstLine
}

// POST /api/queries — create query (extension polls for it)
router.post('/', async (ctx) => {
  const body = CreateQuerySchema.parse(ctx.request.body)

  let stockId: number | null = null
  if (body.stockCode) {
    const res = await pool.query('SELECT id FROM stocks WHERE code = $1', [body.stockCode])
    if (res.rows.length > 0) stockId = res.rows[0].id
  }

  const title = body.kind === 'general' ? titleFromQuestion(body.question) : null

  const result = await pool.query(
    `INSERT INTO queries (stock_id, stock_code, question, provider, execution_mode, status, kind, title)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7) RETURNING *`,
    [stockId, body.stockCode ?? null, body.question, body.provider, body.executionMode, body.kind, title]
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
     WHERE id = (
       SELECT id FROM queries
       WHERE status = 'pending' AND execution_mode = 'backend'
       ORDER BY created_at LIMIT 1
     ) RETURNING *`
  )
  if (rows.length === 0) { ctx.body = { success: true, query: null }; return }
  ctx.body = { success: true, query: rows[0] }
})

// POST /api/queries/claim-app — DISABLED.
// This was a cross-machine fallback queue for missed app-mode dispatches, but it
// let one machine claim another machine's 本地DeepSeek query and run it remotely.
// 本地 queries must run only on the machine that submitted them (via the local
// extension's direct dispatch), so this endpoint now always returns nothing.
// Kept as a no-op so older extensions (≤v13) that still poll it can't leak.
router.post('/claim-app', async (ctx) => {
  ctx.body = { success: true, query: null }
})

// POST /api/queries/:id/to-backend — move a query into the backend queue.
// Used by a machine whose extension is in 后台DeepSeek mode: it hands its own
// submission off to the backend-service machine instead of running it locally.
router.post('/:id/to-backend', async (ctx) => {
  await pool.query(
    `UPDATE queries SET execution_mode = 'backend', status = 'pending', completed_at = NULL WHERE id = $1`,
    [ctx.params.id]
  )
  ctx.body = { success: true }
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
    `UPDATE queries SET status = $1::varchar, completed_at = CASE WHEN $1::varchar IN ('completed','failed') THEN NOW() ELSE NULL END WHERE id = $2`,
    [status, ctx.params.id]
  )
  ctx.body = { success: true }
})

// POST /api/queries/:id/callback — content script posts captured HTML directly
router.post('/:id/callback', async (ctx) => {
  const { html } = ctx.request.body as { html: string }
  if (!html) { ctx.status = 400; ctx.body = { error: 'html required' }; return }
  await saveResponse(parseInt(ctx.params.id), html)
  await pool.query(
    `UPDATE queries SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [ctx.params.id]
  )
  ctx.body = { success: true }
})

// GET /api/queries — list with optional filters.
// kind defaults to 'stock' so the existing 记录/提问 pages are unaffected; the
// 问答 page passes kind=general to get its own queries.
router.get('/', async (ctx) => {
  const { stockCode, status, kind = 'stock', page = '1', pageSize = '20' } = ctx.query as Record<string, string>
  const offset = (parseInt(page) - 1) * parseInt(pageSize)
  const conditions: string[] = []
  const params: unknown[] = []

  params.push(kind); conditions.push(`q.kind = $${params.length}`)
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
