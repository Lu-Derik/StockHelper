'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RawHtmlView } from '@/components/response/raw-html-view'
import { ArrowLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

import { apiFetch } from '@/lib/api'

interface ResponseData {
  format: string
  content: string
  meta: { question: string; stockCode: string | null; createdAt: string }
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const handleDelete = async () => {
    await apiFetch(`/api/queries/${id}`, { method: 'DELETE' })
    router.push('/records')
  }
  const [html, setHtml] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/queries/${id}/response?format=html`)
      .then((r) => r.json())
      .then((h) => {
        if (!h.success) throw new Error(h.error ?? 'Not found')
        setHtml(h)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-muted-foreground text-sm">加载中...</p>
  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!html) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/records" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">查询详情</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />删除
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
            {html.meta.stockCode && (
              <Badge variant="outline" className="font-mono">{html.meta.stockCode}</Badge>
            )}
            {new Date(html.meta.createdAt).toLocaleString('zh-CN')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{html.meta.question}</p>
        </CardContent>
      </Card>

      <RawHtmlView html={html.content} />
    </div>
  )
}
