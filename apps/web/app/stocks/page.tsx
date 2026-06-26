'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Check, X } from 'lucide-react'

import { apiFetch } from '@/lib/api'

interface Stock {
  id: number
  code: string
  name: string
  market: 'SH' | 'SZ'
  concept: string
  created_at: string
}

export default function StocksPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [market, setMarket] = useState<'SH' | 'SZ'>('SH')
  const [saving, setSaving] = useState(false)

  // Inline concept editing state
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const load = () =>
    apiFetch(`/api/stocks`).then((r) => r.json()).then((d) => setStocks(d.data ?? []))

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await apiFetch(`/api/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, market }),
    })
    setCode(''); setName('')
    await load()
    setSaving(false)
  }

  const startEditConcept = (stock: Stock) => {
    setEditingCode(stock.code)
    setEditValue(stock.concept ?? '')
  }

  const cancelEditConcept = () => {
    setEditingCode(null)
    setEditValue('')
  }

  const saveConcept = async (stockCode: string) => {
    await apiFetch(`/api/stocks/${stockCode}/concept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept: editValue.trim() }),
    })
    setEditingCode(null)
    setEditValue('')
    await load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">股票管理</h1>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">代码</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="600519" maxLength={6} className="w-28" required pattern="\d{6}" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="贵州茅台" className="w-36" required />
            </div>
            <div className="space-y-1">
              <Label>市场</Label>
              <div className="flex gap-1">
                {(['SH', 'SZ'] as const).map((m) => (
                  <Button key={m} type="button" size="sm" variant={market === m ? 'default' : 'outline'}
                    onClick={() => setMarket(m)}>{m}</Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving} className="gap-1.5">
              <Plus className="h-4 w-4" />添加
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {stocks.map((s) => (
          <Card key={s.id} className="hover:bg-accent/50 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{s.code}</Badge>
                <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                <Badge variant="secondary" className="text-xs">{s.market}</Badge>
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
                    {s.concept ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        onClick={() => startEditConcept(s)}
                      >
                        {s.concept}
                      </Badge>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground italic"
                        onClick={() => startEditConcept(s)}
                      >
                        + 设置概念板块
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditConcept(s)}
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
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus } from 'lucide-react'

import { apiFetch } from '@/lib/api'

interface Stock { id: number; code: string; name: string; market: 'SH' | 'SZ'; created_at: string }

export default function StocksPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [market, setMarket] = useState<'SH' | 'SZ'>('SH')
  const [saving, setSaving] = useState(false)

  const load = () =>
    apiFetch(`/api/stocks`).then((r) => r.json()).then((d) => setStocks(d.data ?? []))

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await apiFetch(`/api/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, market }),
    })
    setCode(''); setName('')
    await load()
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">股票管理</h1>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">代码</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="600519" maxLength={6} className="w-28" required pattern="\d{6}" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="贵州茅台" className="w-36" required />
            </div>
            <div className="space-y-1">
              <Label>市场</Label>
              <div className="flex gap-1">
                {(['SH', 'SZ'] as const).map((m) => (
                  <Button key={m} type="button" size="sm" variant={market === m ? 'default' : 'outline'}
                    onClick={() => setMarket(m)}>{m}</Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving} className="gap-1.5">
              <Plus className="h-4 w-4" />添加
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {stocks.map((s) => (
          <Card key={s.id} className="hover:bg-accent/50 transition-colors">
            <CardContent className="p-3 flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">{s.code}</Badge>
              <span className="text-sm font-medium truncate">{s.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs">{s.market}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
