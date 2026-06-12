import { WebSocketServer, WebSocket } from 'ws'
import type { WSMessage, QueryMessage, ResponseMessage, StatusMessage } from '@stockhelper/shared'
import { saveResponse } from '../services/responseService'

let wss: WebSocketServer | null = null
// Track connected extension clients
const extensionClients = new Set<WebSocket>()

export function initWebSocketServer(port: number) {
  wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Chrome extension connected')
    extensionClients.add(ws)

    // On connect, dispatch any queries that were created while extension was offline
    dispatchPendingQueries(ws).catch(console.error)

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage
        if (msg.type === 'response') {
          await handleResponse(msg as ResponseMessage)
        } else if (msg.type === 'status') {
          await handleStatus(msg as StatusMessage)
        }
      } catch (err) {
        console.error('WS message error:', err)
      }
    })

    ws.on('close', () => {
      extensionClients.delete(ws)
      console.log('Chrome extension disconnected')
    })
  })

  console.log(`WebSocket server listening on ws://localhost:${port}`)
}

export function sendQueryToExtension(msg: QueryMessage): boolean {
  if (extensionClients.size === 0) return false
  const data = JSON.stringify(msg)
  extensionClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  })
  return true
}

async function dispatchPendingQueries(ws: WebSocket) {
  const { pool } = await import('../db/pool')
  // Only re-dispatch the oldest pending query — extension queues the rest itself
  const { rows } = await pool.query(
    `SELECT * FROM queries WHERE status = 'pending' ORDER BY created_at LIMIT 1`
  )
  for (const q of rows) {
    const msg: QueryMessage = {
      type: 'query',
      payload: { queryId: q.id, question: q.question, provider: q.provider },
    }
    ws.send(JSON.stringify(msg))
    await pool.query(`UPDATE queries SET status = 'running' WHERE id = $1`, [q.id])
    console.log(`Re-dispatched pending query #${q.id} to reconnected extension`)
  }
}

async function handleResponse(msg: ResponseMessage) {
  await saveResponse(msg.payload.queryId, msg.payload.html)
}

async function handleStatus(msg: StatusMessage) {
  const { queryId, status } = msg.payload
  const { pool } = await import('../db/pool')
  await pool.query(
    `UPDATE queries SET status = $1, completed_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE NULL END WHERE id = $2`,
    [status, queryId]
  )
}
