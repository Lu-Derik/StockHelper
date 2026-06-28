import Router from '@koa/router'
import { z } from 'zod'
import { pool } from '../db/pool'

const router = new Router({ prefix: '/api/stocks' })

const CreateStockSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  name: z.string().min(1),
  market: z.enum(['SH', 'SZ']),
})

// Upsert a stock and bump it to the top of the sidebar (most-recently-queried first).
router.post('/', async (ctx) => {
  const body = CreateStockSchema.parse(ctx.request.body)
  const { rows } = await pool.query(
    `INSERT INTO stocks (code, name, market, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM stocks))
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           sort_order = (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM stocks)
     RETURNING *`,
    [body.code, body.name, body.market]
  )
  ctx.body = { success: true, stock: rows[0] }
})

router.get('/', async (ctx) => {
  const { rows } = await pool.query(
    `SELECT * FROM stocks ORDER BY sort_order ASC NULLS LAST, code`
  )
  ctx.body = { success: true, data: rows }
})

const MoveSchema = z.object({ dir: z.enum(['up', 'down']) })

const ConceptSchema = z.object({ concept: z.string().max(100) })

// Update a stock's concept sector tag.
router.patch('/:code/concept', async (ctx) => {
  const code = ctx.params.code
  const { concept } = ConceptSchema.parse(ctx.request.body)
  const { rows } = await pool.query(
    `UPDATE stocks SET concept = $1 WHERE code = $2 RETURNING *`,
    [concept, code]
  )
  if (rows.length === 0) {
    ctx.status = 404
    ctx.body = { error: 'not found' }
    return
  }
  ctx.body = { success: true, stock: rows[0] }
})

// Swap a stock's sort_order with its neighbor in the given direction.
// Uses POST (not PATCH) for the widest client/proxy compatibility.
router.post('/:code/move', async (ctx) => {
  const code = ctx.params.code
  const { dir } = MoveSchema.parse(ctx.request.body)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query(
      `SELECT id, sort_order FROM stocks WHERE code = $1`,
      [code]
    )
    if (cur.rows.length === 0) {
      ctx.status = 404
      ctx.body = { error: 'not found' }
      await client.query('ROLLBACK')
      return
    }
    const { id, sort_order } = cur.rows[0]
    // up → the row just above (largest sort_order less than current)
    // down → the row just below (smallest sort_order greater than current)
    const neighbor = await client.query(
      dir === 'up'
        ? `SELECT id, sort_order FROM stocks WHERE sort_order < $1
           ORDER BY sort_order DESC LIMIT 1`
        : `SELECT id, sort_order FROM stocks WHERE sort_order > $1
           ORDER BY sort_order ASC LIMIT 1`,
      [sort_order]
    )
    if (neighbor.rows.length > 0) {
      const n = neighbor.rows[0]
      await client.query(`UPDATE stocks SET sort_order = $1 WHERE id = $2`, [n.sort_order, id])
      await client.query(`UPDATE stocks SET sort_order = $1 WHERE id = $2`, [sort_order, n.id])
    }
    await client.query('COMMIT')
    ctx.body = { success: true }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})

// Delete a stock and all its associated queries + responses.
router.delete('/:code', async (ctx) => {
  const { code } = ctx.params
  await pool.query(
    `DELETE FROM responses WHERE query_id IN (
       SELECT id FROM queries WHERE stock_code = $1
     )`,
    [code]
  )
  await pool.query(`DELETE FROM queries WHERE stock_code = $1`, [code])
  await pool.query(`DELETE FROM stocks WHERE code = $1`, [code])
  ctx.body = { success: true }
})

export default router
