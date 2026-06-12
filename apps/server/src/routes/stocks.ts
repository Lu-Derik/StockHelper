import Router from '@koa/router'
import { z } from 'zod'
import { pool } from '../db/pool'

const router = new Router({ prefix: '/api/stocks' })

const CreateStockSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  name: z.string().min(1),
  market: z.enum(['SH', 'SZ']),
})

router.post('/', async (ctx) => {
  const body = CreateStockSchema.parse(ctx.request.body)
  const { rows } = await pool.query(
    `INSERT INTO stocks (code, name, market) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
    [body.code, body.name, body.market]
  )
  ctx.body = { success: true, stock: rows[0] }
})

router.get('/', async (ctx) => {
  const { rows } = await pool.query(`SELECT * FROM stocks ORDER BY code`)
  ctx.body = { success: true, data: rows }
})

export default router
