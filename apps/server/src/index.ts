import 'dotenv/config'
import Koa from 'koa'
import Router from '@koa/router'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import queriesRouter from './routes/queries'
import stocksRouter from './routes/stocks'

const app = new Koa()
const PORT = parseInt(process.env.PORT ?? '3001')

app.use(cors({
  origin: (ctx) => {
    const o = ctx.get('origin')
    if (o === 'http://localhost:3000' || o.startsWith('chrome-extension://')) return o
    return ''
  }
}))
app.use(bodyParser())

// Error handling
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string; name?: string }
    ctx.status = error.status ?? 500
    ctx.body = { error: error.message ?? 'Internal server error' }
    if (error.name === 'ZodError') ctx.status = 400
  }
})

const root = new Router()
root.get('/health', (ctx) => { ctx.body = { ok: true } })

app.use(root.routes())
app.use(queriesRouter.routes()).use(queriesRouter.allowedMethods())
app.use(stocksRouter.routes()).use(stocksRouter.allowedMethods())

app.listen(PORT, () => {
  console.log(`🚀 Koa server running on http://localhost:${PORT}`)
})
