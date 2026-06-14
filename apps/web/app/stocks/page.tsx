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
