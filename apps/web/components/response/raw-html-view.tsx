'use client'

import { useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api'

interface Props { html: string }

interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  siteName: string | null
}

const previewCache = new Map<string, LinkPreview>()

// Imperative hover popup — avoids re-rendering the large injected HTML on hover
function attachCitePopup(container: HTMLElement): () => void {
  const pop = document.createElement('div')
  pop.style.cssText =
    'position:fixed;z-index:9999;width:400px;max-width:90vw;display:none;' +
    'border:1px solid var(--border);border-radius:12px;background:var(--popover);' +
    'color:var(--popover-foreground);box-shadow:0 8px 30px rgba(0,0,0,.12);padding:14px;font-size:13px;' +
    'overflow-wrap:anywhere;word-break:break-all;box-sizing:border-box;'
  document.body.appendChild(pop)

  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let currentUrl: string | null = null

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

  const render = (url: string, data: LinkPreview | null) => {
    let host = ''
    try { host = new URL(url).hostname } catch { /* ignore */ }
    const icon = host ? `https://cdn.deepseek.com/site-icons/${host.split('.').slice(-2).join('.')}` : ''
    const site = data?.siteName ?? host
    pop.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;color:var(--muted-foreground);font-size:12px;margin-bottom:8px;">
        ${icon ? `<img src="${esc(icon)}" style="width:16px;height:16px;border-radius:3px;" onerror="this.style.display='none'">` : ''}
        <span>${esc(site)}</span>
      </div>
      ${data
        ? `<a href="${esc(url)}" target="_blank" rel="noreferrer"
             style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;font-size:14px;line-height:1.45;color:inherit;text-decoration:none;margin-bottom:6px;">
             ${esc(data.title ?? url)}</a>
           ${data.description
             ? `<p style="margin:0;color:var(--muted-foreground);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
                ${esc(data.description)}</p>`
             : ''}`
        : `<div style="color:var(--muted-foreground);">加载中…</div>`}
    `
  }

  const show = (x: number, y: number) => {
    pop.style.left = `${x}px`
    pop.style.top = `${y}px`
    pop.style.display = 'block'
  }
  const cancelHide = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }
  const scheduleHide = () => {
    cancelHide()
    hideTimer = setTimeout(() => { pop.style.display = 'none'; currentUrl = null }, 250)
  }

  const onOver = async (e: Event) => {
    const t = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!t || !t.href || !t.querySelector('.ds-markdown-cite')) return
    cancelHide()
    const url = t.href
    if (currentUrl === url) return
    currentUrl = url

    const rect = t.getBoundingClientRect()
    const x = Math.min(rect.left, window.innerWidth - 420)
    const y = rect.bottom + 8
    render(url, previewCache.get(url) ?? null)
    show(x, y)

    if (!previewCache.has(url)) {
      try {
        const res = await apiFetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        const d = (await res.json()) as LinkPreview
        previewCache.set(url, d)
        if (currentUrl === url) render(url, d)
      } catch { /* keep loading state */ }
    }
  }
  const onOut = (e: Event) => {
    const t = (e.target as HTMLElement).closest('a')
    if (t?.querySelector('.ds-markdown-cite')) scheduleHide()
  }

  container.addEventListener('mouseover', onOver)
  container.addEventListener('mouseout', onOut)
  pop.addEventListener('mouseenter', cancelHide)
  pop.addEventListener('mouseleave', scheduleHide)

  return () => {
    container.removeEventListener('mouseover', onOver)
    container.removeEventListener('mouseout', onOut)
    pop.remove()
  }
}

// Reading-view styles — restores DeepSeek's markdown look (the captured innerHTML
// keeps DeepSeek's class names but not its stylesheets) with typography tuning.
const dsPreviewCss = `
.ds-preview {
  line-height: 1.8; font-size: 15.5px; color: var(--foreground);
  letter-spacing: 0.01em;
}
.ds-preview h1, .ds-preview h2, .ds-preview h3, .ds-preview h4 {
  font-weight: 700; margin: 1.6em 0 0.7em; line-height: 1.4; color: var(--foreground);
}
.ds-preview h1 { font-size: 1.55em; }
.ds-preview h2 { font-size: 1.32em; border-bottom: 1px solid var(--border); padding-bottom: 0.35em; }
.ds-preview h3 { font-size: 1.15em; }
.ds-preview p { margin: 0.8em 0; }
.ds-preview ul, .ds-preview ol { margin: 0.8em 0; padding-left: 1.7em; }
.ds-preview ul { list-style: disc; }
.ds-preview ol { list-style: decimal; }
.ds-preview li { margin: 0.4em 0; }
.ds-preview li::marker { color: var(--muted-foreground); }
.ds-preview strong { font-weight: 700; }
.ds-preview em { font-style: italic; }
.ds-preview hr { margin: 2em 0; border: none; border-top: 1px solid var(--border); }
.ds-preview blockquote {
  border-left: 3px solid var(--border); padding-left: 1em; margin: 1em 0;
  color: var(--muted-foreground);
}
.ds-preview code {
  background: var(--muted); border-radius: 4px; padding: 0.15em 0.4em;
  font-size: 0.88em; font-family: ui-monospace, monospace;
}
.ds-preview pre { background: var(--muted); border-radius: 8px; padding: 1em; overflow-x: auto; margin: 1em 0; }
.ds-preview pre code { background: none; padding: 0; }
.ds-preview table {
  border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: 0.93em;
  border-radius: 8px; overflow: hidden;
}
.ds-preview th, .ds-preview td {
  border: 1px solid var(--border); padding: 0.6em 1em; text-align: left;
  line-height: 1.6;
}
.ds-preview th { background: var(--muted); font-weight: 600; }
.ds-preview tr:nth-child(even) td { background: color-mix(in srgb, var(--muted) 40%, transparent); }
.ds-preview a { color: #2563eb; text-decoration: none; }
.ds-preview a:hover { text-decoration: underline; }
.ds-preview img { max-width: 24px; max-height: 24px; display: inline-block; vertical-align: middle; }
.ds-preview svg { max-width: 20px; max-height: 20px; }
.ds-preview .ds-icon { display: inline-flex; align-items: center; }

/* Citation badges. DeepSeek's markup: an opacity-0 "-" spacer plus the number
   absolutely centered at 50%/50% — which requires position:relative on the badge
   itself (that rule lives in DeepSeek's stylesheet and isn't in the saved HTML). */
.ds-preview .ds-markdown-cite {
  position: relative;
  display: inline-block !important;
  min-width: 16px;
  border-radius: 999px;
  background: var(--muted);
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background .15s;
}
.ds-preview .ds-markdown-cite:hover { background: var(--border); }

/* Web search panel header ("Read N web pages" + overlapping source favicons) */
.ds-preview ._74c0879 { margin-bottom: 1.4em; }
.ds-preview ._60aa7fb {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--muted); border-radius: 999px;
  padding: 6px 14px; font-size: 13px;
  color: var(--muted-foreground);
}
.ds-preview ._287b564 { display: inline-flex; align-items: center; padding-left: 6px; }
.ds-preview ._8e95474 {
  width: 18px; height: 18px; border-radius: 50%;
  overflow: hidden; margin-left: -6px;
  border: 1.5px solid var(--background); background: var(--background);
  display: inline-flex;
}
.ds-preview ._8e95474 img { width: 100%; height: 100%; max-width: none; max-height: none; }
`

export function RawHtmlView({ html }: Props) {
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!previewRef.current) return
    return attachCitePopup(previewRef.current)
  }, [])

  return (
    <div className="border rounded-xl px-6 py-5 md:px-8 md:py-6 bg-background overflow-auto">
      <style>{dsPreviewCss}</style>
      <div
        ref={previewRef}
        className="ds-preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
