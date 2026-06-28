'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TrendingUp, ChevronUp, ChevronDown, List, Tag } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { setSelectedStock } from '@/lib/selected-stock'
import { parseTags } from '@/lib/tags'

interface Stock {
  id: number
  code: string
  name: string
  market: string
  concept: string
}

type ViewMode = 'default' | 'concept'

const UNCATEGORIZED = '未定义板块'

export function StockSidebar() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('default')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const selectStock = (s: Stock) => {
    setSelectedStock({ code: s.code, name: s.name })
    if (pathname.startsWith('/records')) {
      router.push(`/records?code=${encodeURIComponent(s.code)}`)
    } else if (pathname === '/kline') {
      router.push(`/kline?code=${encodeURIComponent(s.code)}`)
    } else if (pathname === '/stocks') {
      router.push(`/stocks?code=${encodeURIComponent(s.code)}`, { scroll: false })
    } else {
      router.push(`/?code=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`)
    }
  }

  // Build tag groups: a stock with multiple tags appears in each tag's group.
  const conceptGroups: Map<string, Stock[]> = new Map()
  for (const s of stocks) {
    const tags = parseTags(s.concept)
    const keys = tags.length > 0 ? tags : [UNCATEGORIZED]
    for (const key of keys) {
      if (!conceptGroups.has(key)) conceptGroups.set(key, [])
      conceptGroups.get(key)!.push(s)
    }
  }
  // Move UNCATEGORIZED to the end
  if (conceptGroups.has(UNCATEGORIZED)) {
    const uncategorized = conceptGroups.get(UNCATEGORIZED)!
    conceptGroups.delete(UNCATEGORIZED)
    conceptGroups.set(UNCATEGORIZED, uncategorized)
  }

  if (stocks.length === 0) return null

  return (
    <aside className="w-44 shrink-0 sticky top-20 self-start">
      <div className="rounded-xl border bg-card card-shadow overflow-hidden">
        {/* Header with view toggle */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b bg-muted/40">
          <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
            自选股票
          </span>
          {/* Toggle buttons */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="默认排列"
              onClick={() => setViewMode('default')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'default'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent'
              }`}
            >
              <List className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="按概念板块分类"
              onClick={() => setViewMode('concept')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'concept'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent'
              }`}
            >
              <Tag className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Stock list */}
        <div className="py-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {viewMode === 'default' ? (
            // ── Default view: existing flat ordered list ──
            stocks.map((s, i) => {
              const active = activeCode === s.code
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectStock(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter') selectStock(s) }}
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
                    {parseTags(s.concept).length > 0 && (
                      <span className={`block text-[10px] mt-0.5 truncate ${active ? 'text-primary/50' : 'text-muted-foreground/60'}`}>
                        {parseTags(s.concept).join(' · ')}
                      </span>
                    )}
                  </div>
                  {/* Reorder controls */}
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
            })
          ) : (
            // ── Concept view: grouped by sector ──
            Array.from(conceptGroups.entries()).map(([group, groupStocks]) => {
              const collapsed = collapsedGroups.has(group)
              const isUncategorized = group === UNCATEGORIZED
              return (
                <div key={group} className="border-b border-border/40 last:border-b-0">
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors ${
                      isUncategorized
                        ? 'bg-muted/20 hover:bg-muted/40'
                        : 'bg-muted/50 hover:bg-muted/70'
                    }`}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
                        collapsed ? '-rotate-90' : ''
                      }`}
                    />
                    <span className={`text-xs font-semibold truncate flex-1 ${
                      isUncategorized ? 'text-muted-foreground/60 italic' : 'text-foreground/80'
                    }`}>
                      {group}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground/50 shrink-0 bg-muted rounded px-1">
                      {groupStocks.length}
                    </span>
                  </button>

                  {/* Group stocks */}
                  {!collapsed && (
                    <div className="border-l-2 border-primary/10 ml-3 my-0.5">
                      {groupStocks.map((s) => {
                        const active = activeCode === s.code
                        return (
                          <div
                            key={s.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectStock(s)}
                            onKeyDown={(e) => { if (e.key === 'Enter') selectStock(s) }}
                            className={`flex items-center pl-3 pr-2 py-1.5 cursor-pointer transition-colors ${
                              active
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{s.name}</span>
                              <span className={`block text-xs font-mono mt-0.5 ${
                                active ? 'text-primary/70' : 'text-muted-foreground'
                              }`}>
                                {s.code}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
