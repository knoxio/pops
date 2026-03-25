-- Migration: 20260325120000_locations_last_edited_time.sql
-- Domain: inventory
-- Description: Add missing last_edited_time column to locations table.
--   The Drizzle schema defines this column but the CREATE TABLE SQL omitted it,
--   causing 500 errors on location tree, insurance report, and value breakdown queries.
--
-- Fixes: GH-317, GH-321, GH-322

ALTER TABLE locations ADD COLUMN last_edited_time TEXT NOT NULL DEFAULT (datetime('now'));
