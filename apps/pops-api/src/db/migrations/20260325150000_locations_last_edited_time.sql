-- Add missing last_edited_time column to locations table.
-- Fixes GH-317, GH-321, GH-322: 500 errors on locations tree,
-- insurance report, and value-by-location/type reports.
ALTER TABLE locations ADD COLUMN last_edited_time TEXT NOT NULL DEFAULT (datetime('now'));
