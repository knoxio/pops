-- Add unique constraint on budgets(category, period) with NULL handling.
-- SQLite treats NULL != NULL in standard UNIQUE constraints, so two rows
-- with the same category and NULL period would not conflict. COALESCE with
-- char(0) (NUL byte) is used as the NULL sentinel — char(0) cannot appear
-- in user-supplied text, so no real period value can collide with it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_period
  ON budgets(category, COALESCE(period, char(0)));
