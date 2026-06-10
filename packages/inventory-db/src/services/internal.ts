/**
 * Shared helpers for the inventory schema service layer.
 *
 * `InventoryDb` is re-exported from the package barrel so callers can type
 * the handle they pass in. Any additional helpers added here stay internal
 * to `src/services/*.ts`.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type InventoryDb = BetterSQLite3Database<Record<string, unknown>>;
