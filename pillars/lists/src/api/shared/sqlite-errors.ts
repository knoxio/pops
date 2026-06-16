/**
 * Lift better-sqlite3 constraint-error detection into pillar-internal
 * helpers. Copied verbatim from `apps/pops-api/src/shared/sqlite-errors.ts`
 * during the lists-handler migration so the pillar is self-contained.
 *
 * better-sqlite3 surfaces SQLITE_CONSTRAINT_* on `err.code`; matching the
 * code is resilient to wording changes in future SQLite releases (the
 * messages have shifted before — e.g. "constraint failed" →
 * "UNIQUE constraint failed: t.c").
 */

interface CodedError {
  code: string;
}

function hasCode(err: unknown): err is CodedError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function isUniqueConstraintError(err: unknown): boolean {
  return hasCode(err) && err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export function isForeignKeyConstraintError(err: unknown): boolean {
  return hasCode(err) && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
}
