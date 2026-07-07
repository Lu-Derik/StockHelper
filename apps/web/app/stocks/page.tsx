'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Search, Pencil, Check, X, Trash2 } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { setSelectedStock } from '@/lib/selected-stock'
import { parseTags, normaliseTags } from '@/lib/tags'

interface Stock {
  id: number
  code: string
  name: string
  market: 'SH' | 'SZ'
  concept: string
  created_at: string
}

function StocksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeCode = searchParams.get('code') ?? ''

  const [stocks, setStocks] = useState<Stock[]>([])
  const [searchCode, setSearchCode] = useState('')
  const [searchName, setSearchName] = useState('')
  const [filtered, setFiltered] = useState<Stock[] | null>(null) // null = show all
  const [notFound, setNotFound] = useState(false)

  // Inline concept editing state
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const load = () =>
    apiFetch(`/api/stocks`).then((r) => r.json()).then((d) => {
      setStocks(d.data ?? [])
      // re-apply current filter after reload
      setFiltered(null)
      setNotFound(false)
    })

  useEffect(() => { load() }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const codeQ = searchCode.trim()
    const nameQ = searchName.trim()
    if (!codeQ && !nameQ) { setFiltered(null); setNotFound(false); return }
    const results = stocks.filter((s) => {
      const matchCode = codeQ ? s.code.includes(codeQ) : true
      const matchName = nameQ ? s.name.includes(nameQ) : true
      return matchCode && matchName
    })
    if (results.length === 0) {
      setFiltered([])
      setNotFound(true)
    } else {
      setFiltered(results)
      setNotFound(false)
      // auto-select first match
      const first = results[0]
      setSelectedStock({ code: first.code, name: first.name })
      router.push(`/stocks?code=${encodeURIComponent(first.code)}`, { scroll: false })
    }
  }

  const clearSearch = () => {
    setSearchCode('')
    setSearchName('')
    setFiltered(null)
    setNotFound(false)
  }

  const startEditConcept = (stock: Stock) => {
    setEditingCode(stock.code)
    setEditValue(parseTags(stock.concept).join(' '))
  }

  const cancelEditConcept = () => {
    setEditingCode(null)
    setEditValue('')
  }

  const handleDelete = async (stockCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${stockCode} 及其所有查询记录？`)) return
    await apiFetch(`/api/stocks/${stockCode}`, { method: 'DELETE' })
    window.dispatchEvent(new CustomEvent('stocks-updated'))
    if (activeCode === stockCode) router.push('/stocks', { scroll: false })
    await load()
  }

  const saveConcept = async (stockCode: string) => {
    await apiFetch(`/api/stocks/${stockCode}/concept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept: normaliseTags(editValue) }),
    })
    setEditingCode(null)
    setEditValue('')
    await load()
    window.dispatchEvent(new CustomEvent('stocks-updated'))
  }

  const displayStocks = filtered ?? stocks

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">股票管理</h1>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="searchCode">股票代码</Label>
              <Input
                id="searchCode"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="如：600519"
                maxLength={6}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="searchName">股票名称</Label>
              <Input
                id="searchName"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="如：贵州茅台"
                className="w-36"
              />
            </div>
            <Button type="submit" className="gap-1.5">
              <Search className="h-4 w-4" />查找
            </Button>
            {filtered !== null && (
              <Button type="button" variant="outline" onClick={clearSearch}>
                显示全部
              </Button>
            )}
          </form>

          {notFound && (
            <p className="mt-3 text-sm text-destructive">找不到符合条件的股票</p>
          )}
          {filtered !== null && !notFound && (
            <p className="mt-3 text-sm text-muted-foreground">
              找到 {filtered.length} 只股票
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {displayStocks.map((s) => (
          <Card
            key={s.id}
            className={`group transition-colors cursor-pointer ${activeCode === s.code ? 'border-primary border-2 bg-primary/15 shadow-sm' : 'hover:bg-accent/50'}`}
            onClick={() => {
              setSelectedStock({ code: s.code, name: s.name })
              router.push(`/stocks?code=${encodeURIComponent(s.code)}`, { scroll: false })
            }}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{s.code}</Badge>
                <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                <Badge variant="secondary" className="text-xs">{s.market}</Badge>
                <button
                  type="button"
                  onClick={(e) => handleDelete(s.code, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/15 text-muted-foreground/40 hover:text-destructive shrink-0"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Concept tag row */}
              <div className="mt-2 flex items-center gap-1.5">
                {editingCode === s.code ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="输入概念板块，如：半导体、新能源..."
                      className="h-7 text-xs flex-1"
                      maxLength={100}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveConcept(s.code) }
                        if (e.key === 'Escape') cancelEditConcept()
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => saveConcept(s.code)}
                      className="p-1 rounded hover:bg-primary/15 text-primary shrink-0"
                      title="保存"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditConcept}
                      className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive shrink-0"
                      title="取消"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0" onClick={() => startEditConcept(s)}>
                      {parseTags(s.concept).length > 0 ? (
                        parseTags(s.concept).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          >
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground italic">
                          + 设置概念板块
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startEditConcept(s) }}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground/40 hover:text-muted-foreground shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      title="编辑概念板块"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function StocksPage() {
  return (
    <Suspense>
      <StocksContent />
    </Suspense>
  )
}
