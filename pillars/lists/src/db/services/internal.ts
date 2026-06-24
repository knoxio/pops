/**
 * Shared helpers for the lists schema service layer.
 *
 * `ListsDb` is re-exported from the db barrel (`src/db/index.ts`) so callers
 * can type the handle they pass in. Other helpers here stay internal to
 * `src/db/services/*.ts`.
 *
 * The type uses `Record<string, unknown>` (not `Record<string, never>`) so the
 * alias matches both a narrow per-table handle and the opener's `getDrizzle()`
 * return shape.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type ListsDb = BetterSQLite3Database<Record<string, unknown>>;

/**
 * Extract the row from an `.insert(...).returning().all()` or equivalent
 * mutation that's guaranteed to produce at least one result. Throws with a
 * pointed message if it didn't — that indicates a logic error in the caller
 * (e.g. updating a row id that doesn't exist) rather than a normal flow.
 */
export function expectRow<T>(rows: readonly T[], label: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${label}: expected a row but got none`);
  }
  return row;
}

/** Current ISO timestamp (UTC) — service-layer wall-clock. */
export function nowIso(): string {
  return new Date().toISOString();
}

import { eq, max as sqlMax } from 'drizzle-orm';

import { listItems } from '../schema.js';

/**
 * Next `position` for an insert into a given list — `max(position) + 1`
 * or `0` if the list is empty. Shared between `addItem`, `bulkAdd`, and
 * `upsertItemByRef`.
 */
export function nextPosition(db: ListsDb, listId: number): number {
  const rows = db
    .select({ max: sqlMax(listItems.position) })
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .all();
  const max = rows[0]?.max ?? null;
  return max === null ? 0 : max + 1;
}
