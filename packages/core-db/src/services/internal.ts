/**
 * Shared helpers for the core schema service layer.
 *
 * Not exported from the package — internal to `src/services/*.ts`.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type CoreDb = BetterSQLite3Database<Record<string, unknown>>;
