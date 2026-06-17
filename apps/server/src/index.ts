import 'dotenv/config'
import Koa from 'koa'
import Router from '@koa/router'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import queriesRouter from './routes/queries'
import stocksRouter from './routes/stocks'
import linkPreviewRouter from './routes/linkPreview'
import klineRouter from './routes/kline'

const app = new Koa()
const PORT = parseInt(process.env.PORT ?? '3001')

// Allowed browser origins (comma-separated env, plus localhost dev default)
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)

// Shared secret for public (tunnel) access; empty disables the check (local-only mode)
const API_SECRET = process.env.API_SECRET ?? ''
const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)

app.use(cors({
  origin: (ctx) => {
    const o = ctx.get('origin')
    if (ALLOWED_ORIGINS.has(o) || o.startsWith('chrome-extension://')) return o
    return ''
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key'],
}))
app.use(bodyParser())

// Public-access guard: requests arriving via the public tunnel must carry the
// API key. Requests to localhost (the Chrome extension hitting the box directly)
// are exempt, as is the health check and CORS preflight.
app.use(async (ctx, next) => {
  if (
    API_SECRET &&
    ctx.method !== 'OPTIONS' &&
    ctx.path.startsWith('/api') &&
    !isLocalHost(ctx.host)
  ) {
    if (ctx.get('x-api-key') !== API_SECRET) {
      ctx.status = 401
      ctx.body = { error: 'unauthorized' }
      return
    }
  }
  await next()
})

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
app.use(linkPreviewRouter.routes()).use(linkPreviewRouter.allowedMethods())
app.use(klineRouter.routes()).use(klineRouter.allowedMethods())

app.listen(PORT, () => {
  console.log(`🚀 Koa server running on http://localhost:${PORT}`)
})
