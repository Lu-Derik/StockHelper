import { Suspense } from 'react'
import { QueryForm } from '@/components/query-form'

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">A股AI研究助手</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          输入关于A股的问题，通过 AI 获取深度分析，自动保存到本地
        </p>
      </div>
      <Suspense>
        <QueryForm />
      </Suspense>
    </div>
  )
}
