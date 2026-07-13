'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, Loader2, StopCircle, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RawHtmlView } from '@/components/response/raw-html-view'
import { ChatSidebar } from '@/components/chat-sidebar'
import { apiFetch } from '@/lib/api'

type Status = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

interface RecentItem {
  id: number
  title: string | null
  question: string
  created_at: string
}

interface Detail {
  question: string
  createdAt: string
  status: string
  html: string | null
}

const statusLabel: Record<Status, string> = {
  idle: '待提交',
  pending: '等待扩展...',
  running: 'AI 分析中...',
  completed: '完成',
  failed: '失败',
}

function ChatContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeId = searchParams.get('id')

  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [queryId, setQueryId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const pollTimers = useRef<{ interval?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout> }>({})

  const clearPolling = () => {
    if (pollTimers.current.interval) clearInterval(pollTimers.current.interval)
    if (pollTimers.current.timeout) clearTimeout(pollTimers.current.timeout)
    pollTimers.current = {}
  }
  useEffect(() => clearPolling, [])

  const loadRecent = () =>
    apiFetch(`/api/queries?kind=general&status=completed&pageSize=10`)
      .then((r) => r.json())
      .then((d) => { if (d.data) setRecent(d.data) })
      .catch(() => {})

  useEffect(() => { loadRecent() }, [])

  // Load the selected Q&A detail.
  useEffect(() => {
    if (!activeId) { setDetail(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const meta = await apiFetch(`/api/queries/${activeId}`).then((r) => r.json())
        if (cancelled || !meta.query) return
        const q = meta.query
        if (q.status === 'completed') {
          const resp = await apiFetch(`/api/queries/${activeId}/response?format=html`).then((r) => r.json())
          if (cancelled) return
          setDetail({ question: q.question, createdAt: q.created_at, status: q.status, html: resp.content ?? '' })
        } else {
          setDetail({ question: q.question, createdAt: q.created_at, status: q.status, html: null })
        }
      } catch { if (!cancelled) setDetail(null) }
    })()
    return () => { cancelled = true }
  }, [activeId])

  const pollStatus = (id: number) => {
    clearPolling()
    pollTimers.current.interval = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/queries/${id}`).then((r) => r.json())
        const s: Status = data.query?.status
        if (s === 'completed' || s === 'failed') {
          setStatus(s)
          clearPolling()
          if (s === 'completed') {
            window.dispatchEvent(new CustomEvent('chat-updated'))
            loadRecent()
            router.push(`/chat?id=${id}`, { scroll: false })
          }
        } else if (s === 'running') {
          setStatus('running')
        }
      } catch { clearPolling() }
    }, 2000)
    pollTimers.current.timeout = setTimeout(() => clearPolling(), 300_000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return
    setStatus('pending')
    setError('')
    const q = question.trim()
    try {
      const res = await apiFetch(`/api/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, kind: 'general', executionMode: 'app' }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const id = data.query.id
      setQueryId(id)
      // Hand off to the local extension, which routes per its own mode.
      try {
        window.postMessage({
          type: 'STOCKHELPER_QUERY',
          payload: { queryId: id, question: q, provider: 'deepseek' },
        }, '*')
      } catch {}
      window.dispatchEvent(new CustomEvent('chat-updated'))
      pollStatus(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
      setStatus('failed')
    }
  }

  const handleCancel = async () => {
    clearPolling()
    const id = queryId
    setStatus('idle')
    setQueryId(null)
    if (id != null) {
      try {
        await apiFetch(`/api/queries/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed' }),
        })
      } catch { /* best-effort */ }
    }
  }

  const isBusy = status === 'pending' || status === 'running'

  return (
    <div className="flex gap-6 items-start">
      <ChatSidebar />
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />AI 问答
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">向 AI 提出任意问题，回答自动保存并按日期归档在左侧</p>
        </div>

        <Card className="card-shadow-md border-border/60">
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <Textarea
                placeholder="输入你的问题，例如：解释一下什么是可转债..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                className="resize-none focus-visible:ring-primary/50 text-sm"
                disabled={isBusy}
              />
              <div className="flex items-center gap-2">
                {isBusy ? (
                  <Button type="button" variant="destructive" onClick={handleCancel} className="gap-2">
                    <StopCircle className="h-4 w-4" />终止等待
                  </Button>
                ) : (
                  <Button type="submit" disabled={!question.trim()} className="gap-2">
                    <Send className="h-4 w-4" />发送给 AI
                  </Button>
                )}
                {status !== 'idle' && (
                  <Badge variant={status === 'failed' ? 'destructive' : status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                    {isBusy && <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />}
                    {statusLabel[status]}
                  </Badge>
                )}
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Selected Q&A */}
        {detail && (
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">{new Date(detail.createdAt).toLocaleString('zh-CN')}</p>
                <p className="font-medium">{detail.question}</p>
              </CardContent>
            </Card>
            {detail.html != null ? (
              <RawHtmlView html={detail.html} />
            ) : (
              <p className="text-sm text-muted-foreground">该问题尚未完成（{detail.status}）。</p>
            )}
          </div>
        )}

        {/* Recent questions */}
        {recent.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">最近提问</p>
            <div className="space-y-1.5">
              {recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(`/chat?id=${item.id}`, { scroll: false })}
                  className="w-full text-left flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-accent hover:border-primary/20 transition-all text-sm card-shadow"
                >
                  <span className="truncate flex-1 text-foreground">{item.title || item.question}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {new Date(item.created_at).toLocaleDateString('zh-CN')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  )
}
