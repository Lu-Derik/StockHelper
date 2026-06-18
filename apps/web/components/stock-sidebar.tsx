'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TrendingUp, ChevronUp, ChevronDown } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { setSelectedStock } from '@/lib/selected-stock'

interface Stock {
  id: number
  code: string
  name: string
  market: string
}

export function StockSidebar() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // On a record detail page (/records/[id]) there's no ?code= param; the page
  // broadcasts its stock code so we can still highlight the matching item.
  const [recordCode, setRecordCode] = useState('')
  const onDetail = /^\/records\/.+/.test(pathname)
  const activeCode = searchParams.get('code') ?? (onDetail ? recordCode : '')

  const load = () =>
    apiFetch(`/api/stocks`)
      .then((r) => r.json())
      .then((d) => { if (d.data) setStocks(d.data) })
      .catch(() => {})

  useEffect(() => {
    load()
    window.addEventListener('stocks-updated', load)
    return () => window.removeEventListener('stocks-updated', load)
  }, [])

  // On a record detail page, look up that record's stock so we can highlight it.
  useEffect(() => {
    const m = pathname.match(/^\/records\/(\d+)/)
    if (!m) { setRecordCode(''); return }
    apiFetch(`/api/queries/${m[1]}`)
      .then((r) => r.json())
      .then((d) => setRecordCode(d.query?.stock_code ?? ''))
      .catch(() => {})
  }, [pathname])

  const move = (code: string, dir: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    apiFetch(`/api/stocks/${code}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
    })
      .then(() => load())
      .catch(() => {})
  }

  if (stocks.length === 0) return null

  return (
    <aside className="w-44 shrink-0 sticky top-20 self-start">
      <div className="rounded-xl border bg-card card-shadow overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b bg-muted/40">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            自选股票
          </span>
        </div>

        {/* Stock list */}
        <div className="py-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {stocks.map((s, i) => {
            const active = activeCode === s.code
            const select = () => {
              setSelectedStock({ code: s.code, name: s.name })
              if (pathname.startsWith('/records')) {
                router.push(`/records?code=${encodeURIComponent(s.code)}`)
              } else if (pathname === '/kline') {
                router.push(`/kline?code=${encodeURIComponent(s.code)}`)
              } else {
                router.push(`/?code=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`)
              }
            }
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={select}
                onKeyDown={(e) => { if (e.key === 'Enter') select() }}
                className={`group flex items-center gap-1 px-3 py-2 text-sm cursor-pointer transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <span className={`block text-xs font-mono mt-0.5 ${active ? 'text-primary/70' : 'text-muted-foreground'}`}>
                    {s.code}
                  </span>
                </div>
                {/* Reorder controls (shown on row hover) */}
                <div className="flex flex-col shrink-0 -my-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    aria-label="上移"
                    disabled={i === 0}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => move(s.code, 'up', e)}
                    className="px-1.5 py-0.5 rounded hover:bg-primary/15 disabled:opacity-20 disabled:cursor-not-allowed text-muted-foreground hover:text-primary"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    disabled={i === stocks.length - 1}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => move(s.code, 'down', e)}
                    className="px-1.5 py-0.5 rounded hover:bg-primary/15 disabled:opacity-20 disabled:cursor-not-allowed text-muted-foreground hover:text-primary"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
