'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Loader2, TrendingUp, TrendingDown, CandlestickChart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KLineChart, type Bar } from '@/components/kline-chart'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const RANGES: { label: string; days: number }[] = [
  { label: '近3月', days: 65 },
  { label: '近6月', days: 130 },
  { label: '近1年', days: 250 },
  { label: '近2年', days: 500 },
]

const MA_LEGEND = [
  { label: 'MA5', color: '#eab308' },
  { label: 'MA10', color: '#3b82f6' },
  { label: 'MA20', color: '#a855f7' },
]

function KLinePage() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [input, setInput] = useState(searchParams.get('code') ?? '')
  const [days, setDays] = useState(250)
  const [bars, setBars] = useState<Bar[]>([])
  const [name, setName] = useState<string | null>(null)
  const [tsCode, setTsCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchKline = useCallback((c: string, d: number) => {
    if (!c.trim()) return
    setLoading(true)
    setError('')
    fetch(`${API}/api/kline?code=${encodeURIComponent(c.trim())}&days=${d}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error ?? '获取失败')
        setBars(res.bars ?? [])
        setName(res.name ?? null)
        setTsCode(res.code ?? '')
        if ((res.bars ?? []).length === 0) setError('未查询到该股票的K线数据')
      })
      .catch((e) => { setError(e.message); setBars([]) })
      .finally(() => setLoading(false))
  }, [])

  // react to URL param changes (sidebar)
  useEffect(() => {
    const c = searchParams.get('code') ?? ''
    if (c) { setCode(c); setInput(c) }
  }, [searchParams])

  useEffect(() => {
    if (code) fetchKline(code, days)
  }, [code, days, fetchKline])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setCode(input.trim())
  }

  // derive header stats
  const last = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  const change = last && prev ? last.close - prev.close : 0
  const changePct = last && prev ? (change / prev.close) * 100 : 0
  const up = change >= 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CandlestickChart className="h-6 w-6 text-primary" />
          K线行情
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          输入A股代码查看历史日K线（数据来源：tushare.pro）
        </p>
      </div>

      <Card className="card-shadow-md border-border/60 pt-4">
        <CardContent>
          {/* Search + range controls */}
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={submit} className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="股票代码，如 600519"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="pl-8 w-52 font-mono focus-visible:ring-primary/50"
                  maxLength={9}
                />
              </div>
              <Button type="submit" disabled={loading || !input.trim()} className="gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                查询
              </Button>
            </form>

            <div className="flex items-center gap-1 ml-auto bg-muted/50 rounded-lg p-1">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    days === r.days
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stat header */}
          {last && !loading && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{name ?? '—'}</span>
                <Badge variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-0">
                  {tsCode}
                </Badge>
              </div>
              <div className={`flex items-baseline gap-2 ${up ? 'text-red-500' : 'text-emerald-500'}`}>
                <span className="text-2xl font-bold tabular-nums">{last.close.toFixed(2)}</span>
                <span className="text-sm font-medium tabular-nums flex items-center gap-0.5">
                  {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {up ? '+' : ''}{change.toFixed(2)} ({up ? '+' : ''}{changePct.toFixed(2)}%)
                </span>
              </div>
              <div className="ml-auto flex items-center gap-3 text-xs">
                {MA_LEGEND.map((m) => (
                  <span key={m.label} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-3 h-0.5 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chart area */}
          <div className="mt-4">
            {loading ? (
              <div className="h-[480px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error ? (
              <div className="h-[480px] flex flex-col items-center justify-center gap-2 text-center">
                <CandlestickChart className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : bars.length > 0 ? (
              <KLineChart bars={bars} />
            ) : (
              <div className="h-[480px] flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <CandlestickChart className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm">输入股票代码开始查询</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Page() {
  return <Suspense><KLinePage /></Suspense>
}
