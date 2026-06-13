import Router from '@koa/router'

const router = new Router({ prefix: '/api/link-preview' })

interface Preview {
  url: string
  title: string | null
  description: string | null
  siteName: string | null
  fetchedAt: number
}

const cache = new Map<string, Preview>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

function pickMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function decodeBody(buf: ArrayBuffer, contentType: string, headHtml: string): string {
  // Many Chinese sites use GBK — detect from header or meta charset
  let charset =
    contentType.match(/charset=([\w-]+)/i)?.[1] ??
    headHtml.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8'
  charset = charset.toLowerCase()
  if (charset === 'gb2312' || charset === 'gb18030') charset = 'gbk'
  try {
    return new TextDecoder(charset).decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

router.get('/', async (ctx) => {
  const url = ctx.query.url as string
  if (!url || !/^https?:\/\//.test(url)) {
    ctx.status = 400
    ctx.body = { error: 'valid url required' }
    return
  }

  const cached = cache.get(url)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    ctx.body = { success: true, ...cached }
    return
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timer)

    const buf = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? ''
    // Decode first 4KB as ascii-ish to sniff meta charset, then decode properly
    const sniff = new TextDecoder('latin1').decode(buf.slice(0, 4096))
    const html = decodeBody(buf, contentType, sniff).slice(0, 200_000)

    const title =
      pickMeta(html, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
        /<title[^>]*>([^<]+)<\/title>/i,
      ]) ?? null

    const description =
      pickMeta(html, [
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      ]) ?? null

    const siteName =
      pickMeta(html, [
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      ]) ?? new URL(url).hostname

    const preview: Preview = { url, title, description, siteName, fetchedAt: Date.now() }
    cache.set(url, preview)
    ctx.body = { success: true, ...preview }
  } catch {
    const fallback: Preview = {
      url, title: null, description: null,
      siteName: new URL(url).hostname, fetchedAt: Date.now(),
    }
    cache.set(url, fallback)
    ctx.body = { success: true, ...fallback }
  }
})

export default router
