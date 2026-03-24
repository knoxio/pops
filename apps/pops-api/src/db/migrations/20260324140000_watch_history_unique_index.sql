-- Migration: 20260324140000_watch_history_unique_index.sql
-- Domain: media
-- Description: Add unique index on (media_type, media_id, watched_at) to prevent
--   duplicate watch history entries from Plex sync re-runs.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS idx_watch_history_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_history_unique
  ON watch_history(media_type, media_id, watched_at);
