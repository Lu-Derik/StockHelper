'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { apiFetch } from '@/lib/api'

const EXTENSION_MESSAGE_TYPE = 'run_query'

const PENDING_KEY = 'stockhelper_pending_query'
const EXECUTION_MODE_KEY = 'stockhelper_execution_mode'
// Ids hidden from the 提问 history list. These only remove the entry here;
// the underlying record stays in the DB and on the 记录 page.
const DISMISSED_KEY = 'stockhelper_dismissed_history'

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as number[]) : [])
  } catch { return new Set() }
}

function saveDismissed(ids: Set<number>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

type Status = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

interface HistoryItem {
  id: number
  question: string
  stock_code: string | null
  created_at: string
}

interface PendingQuery {
  queryId: number
  displayQuestion: string
  status: Status
}

function stripPrefix(q: string): string {
  return q.replace(/^(?:股票(?:代码|名称)为 [^，]+，)+/, '')
}

function detectMarket(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') ? 'SH' : 'SZ'
}

function savePending(p: PendingQuery | null) {
  if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p))
  else localStorage.removeItem(PENDING_KEY)
}

function loadPending(): PendingQuery | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingQuery) : null
  } catch { return null }
}

// UI-level execution modes. 'dev' is a local-only variant of 'app' that routes
// the extension's callback to the local backend instead of the public tunnel.
type ExecMode = 'app' | 'backend' | 'dev'

// The local backend the extension should talk to in dev mode.
const DEV_SERVER = 'http://localhost:3011'

function loadExecutionMode(): ExecMode {
  try {
    const raw = localStorage.getItem(EXECUTION_MODE_KEY)
    if (raw === 'backend') return 'backend'
    if (raw === 'dev') return 'dev'
    return 'app'
  } catch { return 'app' }
}

function saveExecutionMode(mode: ExecMode) {
  localStorage.setItem(EXECUTION_MODE_KEY, mode)
}

export function QueryForm() {
  const searchParams = useSearchParams()
  const [question, setQuestion] = useState(searchParams.get('code') ? '' : '')
  const [stockCode, setStockCode] = useState(searchParams.get('code') ?? '')
  const [stockName, setStockName] = useState(searchParams.get('name') ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [queryId, setQueryId] = useState<number | null>(null)
  const [executionMode, setExecutionMode] = useState<ExecMode>(loadExecutionMode)
  // 开发DeepSeek is only offered when the app itself is served from localhost.
  const [isLocal, setIsLocal] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    const host = window.location.hostname
    const local = host === 'localhost' || host === '127.0.0.1'
    setIsLocal(local)
    // If a stored 'dev' preference is loaded on a non-local host, fall back.
    if (!local && executionMode === 'dev') {
      setExecutionMode('app')
      saveExecutionMode('app')
    }
  }, [])

  // Restore in-progress query on mount
  useEffect(() => {
    const pending = loadPending()
    if (pending && (pending.status === 'pending' || pending.status === 'running')) {
      setQueryId(pending.queryId)
      setStatus(pending.status)
      setQuestion(pending.displayQuestion)
      pollStatus(pending.queryId)
    }
  }, [])

  useEffect(() => {
    const code = searchParams.get('code') ?? ''
    const name = searchParams.get('name') ?? ''
    if (code) setStockCode(code)
    if (name) setStockName(name)
  }, [searchParams])

  useEffect(() => {
    apiFetch(`/api/queries?pageSize=20&status=completed`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.data) return
        const dismissed = loadDismissed()
        const seen = new Set<string>()
        const deduped: HistoryItem[] = []
        for (const item of d.data as HistoryItem[]) {
          if (dismissed.has(item.id)) continue
          const key = stripPrefix(item.question)
          if (!seen.has(key)) { seen.add(key); deduped.push(item) }
          if (deduped.length === 10) break
        }
        setHistory(deduped)
      })
      .catch(() => {})
  }, [])

  // Only hide the entry from this list — does NOT delete the record.
  // Real deletion happens on the 记录 page.
  const deleteHistory = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const dismissed = loadDismissed()
    dismissed.add(id)
    saveDismissed(dismissed)
    setHistory((prev) => prev.filter((h) => h.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return
    setStatus('pending')
    setError('')

    const parts: string[] = []
    if (stockCode.trim()) parts.push(`股票代码为 ${stockCode.trim()}`)
    if (stockName.trim()) parts.push(`股票名称为 ${stockName.trim()}`)
    const prefix = parts.length ? parts.join('，') + '，' : ''
    const finalQuestion = prefix + question.trim()

    // Both 'app' and 'dev' dispatch directly to the extension; only the callback
    // target differs. The DB only distinguishes 'app' vs 'backend'.
    const backendMode = executionMode === 'backend' ? 'backend' : 'app'

    try {
      const res = await apiFetch(`/api/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: finalQuestion,
          stockCode: stockCode.trim() || undefined,
          executionMode: backendMode,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      if (executionMode !== 'backend') {
        try {
          window.postMessage({
            type: 'STOCKHELPER_QUERY',
            payload: {
              queryId: data.query.id,
              question: finalQuestion,
              provider: 'deepseek',
              // dev mode routes the extension's callback to the local backend
              server: executionMode === 'dev' ? DEV_SERVER : undefined,
            },
          }, '*')
        } catch {}
      }

      if (stockCode.trim() && stockName.trim()) {
        apiFetch(`/api/stocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: stockCode.trim(),
            name: stockName.trim(),
            market: detectMarket(stockCode.trim()),
          }),
        })
          .then(() => window.dispatchEvent(new CustomEvent('stocks-updated')))
          .catch(() => {})
      }

      const newId = data.query.id
      const newStatus: Status = data.query.status
      setQueryId(newId)
      setStatus(newStatus)
      savePending({ queryId: newId, displayQuestion: question.trim(), status: newStatus })
      pollStatus(newId, question.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
      setStatus('failed')
      savePending(null)
    }
  }

  const pollStatus = (id: number, displayQuestion = '') => {
    const q = displayQuestion || (loadPending()?.displayQuestion ?? '')
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/queries/${id}`)
        const data = await res.json()
        const s: Status = data.query?.status
        if (s === 'completed' || s === 'failed') {
          setStatus(s)
          savePending(null)
          clearInterval(interval)
          // server may have auto-registered a stock from the response
          if (s === 'completed') window.dispatchEvent(new CustomEvent('stocks-updated'))
        } else if (s === 'running') {
          setStatus('running')
          savePending({ queryId: id, displayQuestion: q, status: 'running' })
        }
      } catch { clearInterval(interval) }
    }, 2000)
    setTimeout(() => { clearInterval(interval); savePending(null) }, 180_000)
  }

  const statusBadge: Record<Status, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    idle: { label: '待提交', variant: 'outline' },
    pending: { label: '等待扩展...', variant: 'secondary' },
    running: { label: 'AI 分析中...', variant: 'default' },
    completed: { label: '完成', variant: 'default' },
    failed: { label: '失败', variant: 'destructive' },
  }

  const isBusy = status === 'pending' || status === 'running'

  return (
    <div className="space-y-5">
      <Card className="card-shadow-md border-border/60 pt-3">
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="question" className="text-sm font-medium">问题</Label>
              <Textarea
                id="question"
                placeholder="例：分析贵州茅台2024年的基本面，包括营收增长、利润率和估值情况..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                className="resize-none focus-visible:ring-primary/50 text-sm"
                disabled={isBusy}
              />
            </div>

            {/* Stock code / name / send button — all on one row */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="executionMode" className="text-sm font-medium">执行模式</Label>
                <select
                  id="executionMode"
                  value={executionMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as ExecMode
                    setExecutionMode(nextMode)
                    saveExecutionMode(nextMode)
                  }}
                  disabled={isBusy}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="app">本地DeepSeek</option>
                  <option value="backend">后台DeepSeek</option>
                  {isLocal && <option value="dev">开发DeepSeek</option>}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="stockCode" className="text-sm font-medium">股票代码（可选）</Label>
                <Input
                  id="stockCode"
                  placeholder="如：600519"
                  value={stockCode}
                  onChange={(e) => setStockCode(e.target.value)}
                  maxLength={6}
                  disabled={isBusy}
                  className="font-mono focus-visible:ring-primary/50"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="stockName" className="text-sm font-medium">股票名称（可选）</Label>
                <Input
                  id="stockName"
                  placeholder="如：贵州茅台"
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  disabled={isBusy}
                  className="focus-visible:ring-primary/50"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                {/* invisible label keeps button vertically aligned with inputs */}
                <span className="text-sm invisible select-none">_</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    disabled={!question.trim() || isBusy}
                    className="flex-1 gap-2 shadow-sm"
                  >
                    {isBusy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                    发送给 AI
                  </Button>
                  {status !== 'idle' && (
                    <Badge variant={statusBadge[status].variant} className="text-xs whitespace-nowrap shrink-0">
                      {statusBadge[status].label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {status === 'completed' && queryId && (
              <a
                href={`/records/${queryId}`}
                className="text-sm text-primary font-medium hover:underline underline-offset-4 flex items-center gap-1"
              >
                查看结果 →
              </a>
            )}
          </form>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            最近提问
          </p>
          <div className="space-y-1.5">
            {history.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-accent hover:border-primary/20 transition-all text-sm card-shadow"
              >
                {/* clickable area */}
                <button
                  type="button"
                  onClick={() => setQuestion(stripPrefix(item.question))}
                  className="flex-1 text-left min-w-0 flex items-center gap-2"
                  disabled={isBusy}
                >
                  {item.stock_code && (
                    <Badge variant="secondary" className="font-mono shrink-0 text-xs bg-primary/10 text-primary border-0">
                      {item.stock_code}
                    </Badge>
                  )}
                  <span className="truncate text-foreground">{stripPrefix(item.question)}</span>
                </button>
                {/* date + delete — right-aligned inside the row */}
                <span className="shrink-0 text-muted-foreground text-xs">
                  {new Date(item.created_at).toLocaleDateString('zh-CN')}
                </span>
                <button
                  type="button"
                  onClick={(e) => deleteHistory(item.id, e)}
                  className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
