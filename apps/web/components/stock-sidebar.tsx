'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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
    fetch(`${API}/api/stocks`)
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
    <aside className="w-44 shrink-0 space-y-1.5 sticky top-20 self-start">
      <p className="text-xs font-medium text-muted-foreground px-1">股票列表</p>
      <div className="space-y-0.5 max-h-[calc(100vh-6rem)] overflow-y-auto">
        {stocks.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
            if (pathname === '/records') {
              router.push(`/records?code=${encodeURIComponent(s.code)}`)
            } else {
              router.push(`/?code=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`)
            }
          }}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors border truncate ${
              activeCode === s.code
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-transparent hover:border-border'
            }`}
          >
            {s.name}<span className="font-mono opacity-60">({s.code})</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
