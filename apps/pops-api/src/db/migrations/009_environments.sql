-- Migration 009: Named environment support
-- Each environment gets its own SQLite database file.
-- This table (in the prod DB) tracks metadata and TTLs for all environments.

CREATE TABLE IF NOT EXISTS environments (
  name       TEXT    PRIMARY KEY CHECK(name != 'prod'),
  db_path    TEXT    NOT NULL,
  seed_type  TEXT    NOT NULL DEFAULT 'none' CHECK(seed_type IN ('none', 'test')),
  ttl_seconds INTEGER,          -- NULL = infinite
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT               -- NULL = infinite; set to ISO 8601 timestamp (via Date.toISOString()) on create
);

CREATE INDEX IF NOT EXISTS idx_environments_expires_at ON environments(expires_at);
