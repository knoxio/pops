-- Fix movie titles stored with surrounding double-quote characters
-- (e.g. `"Wuthering Heights"` → `Wuthering Heights`).
--
-- Source: TMDB returns this title with literal quotes for the 2026 adaptation.
-- Scope:
--   - title LIKE '"%"'      → must start AND end with `"` (one-sided quotes untouched)
--   - length(title) > 2     → excludes bare `""`
--   - TRIM(title,'"') != '' → excludes all-quote strings like `"""` (would yield empty)
-- SQLite TRIM(X, Y) removes all Y chars from both ends of X.
UPDATE movies
SET title = TRIM(title, '"')
WHERE title LIKE '"%"'
  AND length(title) > 2
  AND TRIM(title, '"') != '';
