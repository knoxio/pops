/**
 * Shared helpers for the lists service layer (PRD-112).
 *
 * Not exported from the package — internal to `src/db/services/*.ts`.
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
