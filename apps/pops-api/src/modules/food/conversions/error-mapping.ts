/**
 * Error-mapping convention shared with the aliases / variants routers:
 *
 *   - SQLite `UNIQUE` constraint failures → tRPC `CONFLICT`
 *   - `expectRow(...)` "no row" failures   → tRPC `NOT_FOUND`
 *   - `SeededRowProtected`                  → `{ ok:false, reason:'seeded' }`
 */
import { TRPCError } from '@trpc/server';

import { SeededRowProtected } from '@pops/app-food-db';

import { isUniqueConstraintError } from '../../../shared/sqlite-errors.js';

/**
 * `conversionsService.update*` calls `expectRow(...)` against the returning
 * row set, which throws a plain Error of shape "label: expected a row but
 * got none". The suffix is stable across upstream revisions, so a substring
 * check is the least-leaky way to distinguish "no such id" from a real DB
 * error.
 */
export function isExpectRowMiss(err: unknown): boolean {
  return err instanceof Error && /expected a row but got none/i.test(err.message);
}

/** Wrap a create-style mutation: UNIQUE → CONFLICT, others propagate. */
export function runCreate<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `${label}: row already exists`,
        cause: err,
      });
    }
    throw err;
  }
}

/** Wrap an update-style mutation: expectRow-miss → NOT_FOUND. */
export function runUpdate<T>(resource: string, id: number, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isExpectRowMiss(err)) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `${resource} #${id} not found`,
      });
    }
    throw err;
  }
}

/**
 * Phase A's `delete*` upstream throws `SeededRowProtected` and silently
 * no-ops on unknown ids. The wire surface prefers the discriminated
 * `ok:false / reason:'seeded'` shape because the UI renders a tooltip
 * rather than a toast; idempotent ok:true on unknown id matches the
 * existing upstream contract.
 */
export function runDelete(fn: () => void): { ok: true } | { ok: false; reason: 'seeded' } {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof SeededRowProtected) return { ok: false, reason: 'seeded' };
    throw err;
  }
}
