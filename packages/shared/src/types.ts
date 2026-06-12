export type AIProvider = 'deepseek' | 'doubao' | 'kimi' | 'tongyi'

export type ResponseFormat = 'html' | 'markdown' | 'styled'

export interface Stock {
  id: number
  code: string        // e.g. "600519"
  name: string        // e.g. "贵州茅台"
  market: 'SH' | 'SZ' // 沪市/深市
  createdAt: Date
}

export interface Query {
  id: number
  stockId: number | null
  stockCode: string | null
  question: string
  provider: AIProvider
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
  completedAt: Date | null
}

export interface Response {
  id: number
  queryId: number
  rawHtml: string
  markdown: string
  provider: AIProvider
  model: string | null
  createdAt: Date
}

// WebSocket messages between server and Chrome extension
export interface WSMessage {
  type: 'query' | 'response' | 'error' | 'status'
  payload: unknown
}

export interface QueryMessage extends WSMessage {
  type: 'query'
  payload: {
    queryId: number
    question: string
    provider: AIProvider
  }
}

export interface ResponseMessage extends WSMessage {
  type: 'response'
  payload: {
    queryId: number
    html: string
  }
}

export interface StatusMessage extends WSMessage {
  type: 'status'
  payload: {
    queryId: number
    status: Query['status']
    message?: string
  }
}
