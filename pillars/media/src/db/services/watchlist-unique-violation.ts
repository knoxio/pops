/**
 * Detect whether an error from a `watchlist` write is a UNIQUE violation
 * on the `(media_type, media_id)` index. better-sqlite3 surfaces UNIQUE
 * index violations with `code = 'SQLITE_CONSTRAINT_UNIQUE'`; drizzle may
 * wrap the original as `.cause`, so we walk the cause chain.
 *
 * The broader `SQLITE_CONSTRAINT` code is accepted as a defensive fallback
 * for older drivers that drop the suffix.
 */
const MAX_CAUSE_DEPTH = 5;

export function isWatchlistMediaUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matchesWatchlistMediaUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesWatchlistMediaUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed:\s*watchlist\./.test(err.message) ||
    /UNIQUE constraint failed:\s*index 'idx_watchlist_media/.test(err.message)
  );
}
