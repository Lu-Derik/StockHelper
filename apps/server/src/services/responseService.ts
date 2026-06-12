import TurndownService from 'turndown'
import { pool } from '../db/pool'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})

export async function saveResponse(queryId: number, rawHtml: string) {
  const markdown = turndown.turndown(rawHtml)

  await pool.query(
    `INSERT INTO responses (query_id, raw_html, markdown, provider)
     SELECT $1, $2, $3, provider FROM queries WHERE id = $1`,
    [queryId, rawHtml, markdown]
  )

  await pool.query(
    `UPDATE queries SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [queryId]
  )
}
