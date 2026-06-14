'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TrendingUp } from 'lucide-react'

import { apiFetch } from '@/lib/api'

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
  const activeCode = searchParams.get('code') ?? ''

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
          {stocks.map((s) => {
            const active = activeCode === s.code
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (pathname === '/records') {
                    router.push(`/records?code=${encodeURIComponent(s.code)}`)
                  } else if (pathname === '/kline') {
                    router.push(`/kline?code=${encodeURIComponent(s.code)}`)
                  } else {
                    router.push(`/?code=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`)
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span className="block truncate">{s.name}</span>
                <span className={`block text-xs font-mono mt-0.5 ${active ? 'text-primary/70' : 'text-muted-foreground'}`}>
                  {s.code}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
