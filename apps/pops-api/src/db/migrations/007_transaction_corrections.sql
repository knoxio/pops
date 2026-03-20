-- Migration 007: Transaction corrections learning system
-- Stores user corrections to improve future imports

CREATE TABLE IF NOT EXISTS transaction_corrections (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Pattern matching
  description_pattern TEXT NOT NULL,
  match_type TEXT CHECK(match_type IN ('exact', 'contains', 'regex')) NOT NULL DEFAULT 'exact',

  -- Correction fields (nullable = not corrected)
  entity_id TEXT,
  entity_name TEXT,
  location TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  transaction_type TEXT CHECK(transaction_type IN ('purchase', 'transfer', 'income')),

  -- Metadata
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  times_applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,

  -- Foreign key
  FOREIGN KEY (entity_id) REFERENCES entities(notion_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON transaction_corrections(description_pattern);
CREATE INDEX IF NOT EXISTS idx_corrections_confidence ON transaction_corrections(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_times_applied ON transaction_corrections(times_applied DESC);

-- View for high-confidence corrections
CREATE VIEW IF NOT EXISTS v_active_corrections AS
SELECT * FROM transaction_corrections
WHERE confidence >= 0.7
ORDER BY confidence DESC, times_applied DESC;
