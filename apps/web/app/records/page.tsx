'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, Search, Trash2, ListFilter } from 'lucide-react'

import { apiFetch } from '@/lib/api'

interface QueryRecord {
  id: number
  stock_code: string | null
  question: string
  provider: string
  status: string
  created_at: string
  response_id: number | null
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成', failed: '失败', running: '进行中', pending: '等待中',
}
const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default', failed: 'destructive', running: 'secondary', pending: 'outline',
}

export default function RecordsPage() {
  return <Suspense><RecordsList /></Suspense>
}

function RecordsList() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const filterCode = searchParams.get('code') ?? ''

  const [records, setRecords] = useState<QueryRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = (code?: string) => {
    const qs = code ? `?pageSize=100&stockCode=${encodeURIComponent(code)}` : '?pageSize=100'
    apiFetch(`/api/queries${qs}`)
      .then((r) => r.json())
      .then((d) => { setRecords(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load(filterCode || undefined) }, [filterCode])

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDeleting(id)
    await apiFetch(`/api/queries/${id}`, { method: 'DELETE' })
    setRecords((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  const filtered = records.filter((r) =>
    r.question.includes(search) || r.stock_code?.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">查询记录</h1>
          {filterCode && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-sm">{filterCode}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => router.push('/records')}
              >
                <ListFilter className="h-3 w-3" />
                所有记录
              </Button>
            </div>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索股票代码或问题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无记录</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link key={r.id} href={`/records/${r.id}`}>
              <Card className="hover:border-primary/30 hover:card-shadow-hover transition-all cursor-pointer card-shadow border-border/60 group">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {r.stock_code && (
                        <Badge variant="secondary" className="text-xs font-mono bg-primary/10 text-primary border-0 shrink-0">
                          {r.stock_code}
                        </Badge>
                      )}
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'} className="text-xs shrink-0">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground ml-auto shrink-0">
                        {new Date(r.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <p className="text-sm truncate text-foreground/90">{r.question}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {r.response_id && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={(e) => handleDelete(e, r.id)}
                      disabled={deleting === r.id}
                      aria-label="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
