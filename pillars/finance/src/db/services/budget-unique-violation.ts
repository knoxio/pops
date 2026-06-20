/**
 * better-sqlite3 surfaces UNIQUE index violations with
 * `code = 'SQLITE_CONSTRAINT_UNIQUE'` and a message that names the table
 * or the index. Drizzle wraps these in a `DrizzleError` carrying the
 * original as `.cause`, so we walk the cause chain.
 *
 * Accept the broader `SQLITE_CONSTRAINT` family too as a defensive fallback
 * for older drivers that drop the suffix.
 */
const MAX_CAUSE_DEPTH = 5;

export function isBudgetUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matchesBudgetsUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesBudgetsUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: budgets/.test(err.message) ||
    /UNIQUE constraint failed: index 'idx_budgets_/.test(err.message)
  );
}
