'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'

import { apiFetch } from '@/lib/api'

interface ChatItem {
  id: number
  title: string | null
  question: string
  status: string
  created_at: string
}

// Local YYYY-MM-DD for same-day grouping.
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString())
  const yest = dayKey(new Date(Date.now() - 86400000).toISOString())
  if (key === today) return '今天'
  if (key === yest) return '昨天'
  return key
}

export function ChatSidebar() {
  const [items, setItems] = useState<ChatItem[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeId = searchParams.get('id') ?? ''
  const activeRef = useRef<HTMLButtonElement>(null)

  const load = () =>
    apiFetch(`/api/queries?kind=general&pageSize=200`)
      .then((r) => r.json())
      .then((d) => { if (d.data) setItems(d.data) })
      .catch(() => {})

  useEffect(() => {
    load()
    window.addEventListener('chat-updated', load)
    return () => window.removeEventListener('chat-updated', load)
  }, [])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  // Group by day (items already ordered created_at DESC from the API).
  const groups: { key: string; items: ChatItem[] }[] = []
  for (const it of items) {
    const k = dayKey(it.created_at)
    const g = groups.find((x) => x.key === k)
    if (g) g.items.push(it)
    else groups.push({ key: k, items: [it] })
  }

  return (
    <aside className="w-60 min-w-[15rem] shrink-0 sticky top-20 self-start">
      <div className="rounded-xl border bg-card card-shadow overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b bg-muted/40">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
            历史问答
          </span>
        </div>

        <div className="py-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground/60">暂无问答记录</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="border-b border-border/40 last:border-b-0">
                <div className="px-3 py-1.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground/70 sticky top-0">
                  {dayLabel(g.key)}
                </div>
                {g.items.map((it) => {
                  const active = String(it.id) === activeId
                  return (
                    <button
                      key={it.id}
                      ref={active ? activeRef : undefined}
                      type="button"
                      onClick={() => router.push(`/chat?id=${it.id}`, { scroll: false })}
                      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors truncate ${
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                      title={it.question}
                    >
                      {it.title || it.question || `问答 #${it.id}`}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
