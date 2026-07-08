import { pool } from './pool'

const schema = `
CREATE TABLE IF NOT EXISTS stocks (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(10) NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  market     CHAR(2) NOT NULL CHECK (market IN ('SH', 'SZ')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queries (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER REFERENCES stocks(id) ON DELETE SET NULL,
  stock_code      VARCHAR(10),
  question        TEXT NOT NULL,
  provider        VARCHAR(20) NOT NULL DEFAULT 'deepseek',
  execution_mode  VARCHAR(20) NOT NULL DEFAULT 'backend'
                  CHECK (execution_mode IN ('app', 'backend')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

ALTER TABLE queries ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20) NOT NULL DEFAULT 'backend';

CREATE TABLE IF NOT EXISTS responses (
  id         SERIAL PRIMARY KEY,
  query_id   INTEGER NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  raw_html   TEXT NOT NULL,
  markdown   TEXT NOT NULL,
  provider   VARCHAR(20) NOT NULL,
  model      VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queries_stock_code ON queries(stock_code);
CREATE INDEX IF NOT EXISTS idx_queries_status ON queries(status);
CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_query_id ON responses(query_id);

-- Sidebar ordering: lower sort_order = higher in the list.
-- Manual up/down swaps neighbors; a fresh query bumps the stock to the top.
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS sort_order INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM stocks WHERE sort_order IS NULL
)
UPDATE stocks s SET sort_order = o.rn FROM ordered o WHERE s.id = o.id;

-- Concept sector tag (manually set by user).
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS concept VARCHAR(100) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_stocks_sort_order ON stocks(sort_order);
`

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(schema)
    console.log('✅ Database migration completed')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
