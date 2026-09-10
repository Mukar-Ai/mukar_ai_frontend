CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_text TEXT,
  objective TEXT,
  requested_amount REAL,
  requested_term INTEGER,
  amount REAL NOT NULL,
  term INTEGER NOT NULL,
  upfront_pct INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  evidence_confidence TEXT,
  evidence_count INTEGER DEFAULT 0,
  structure TEXT,
  recommendation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals (created_at DESC);
