-- Mirror of `0042_strip_quoted_movie_titles.sql` for the tv_shows table.
-- Fixes any tv_shows rows whose `name` or `original_name` was persisted with
-- surrounding double-quote characters via TheTVDB (drift-check #2403; the
-- upstream guard lives in apps/pops-api/src/modules/media/thetvdb/types-mappers.ts
-- and apps/pops-api/src/modules/media/lib/strip-surrounding-quotes.ts).
--
-- Scope, per column:
--   - column LIKE '"%"'        → must start AND end with `"` (one-sided untouched)
--   - length(column) > 2       → excludes bare `""`
--   - TRIM(column, '"') != ''  → excludes all-quote strings like `"""`
-- SQLite TRIM(X, Y) removes all Y chars from both ends of X.

UPDATE tv_shows
SET name = TRIM(name, '"')
WHERE name LIKE '"%"'
  AND length(name) > 2
  AND TRIM(name, '"') != '';

UPDATE tv_shows
SET original_name = TRIM(original_name, '"')
WHERE original_name LIKE '"%"'
  AND length(original_name) > 2
  AND TRIM(original_name, '"') != '';
