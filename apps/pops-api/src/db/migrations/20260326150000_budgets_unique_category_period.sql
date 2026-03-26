-- Add unique constraint on budgets(category, period) with NULL handling.
-- SQLite treats NULL != NULL in standard UNIQUE constraints, so two rows
-- with the same category and NULL period would not conflict. Using COALESCE
-- with a sentinel value ensures NULL periods are treated as equal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_period
  ON budgets(category, COALESCE(period, '__NULL__'));
