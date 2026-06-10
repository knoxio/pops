/**
 * Shared helpers for the food schema service layer.
 *
 * `FoodDb` is re-exported from the package barrel so callers can type
 * the handle they pass in. Any additional helpers added here stay internal
 * to `src/services/*.ts`.
 *
 * The type uses `Record<string, unknown>` (not `Record<string, never>`) so
 * the same alias matches both the package's narrow handle and the pops-api
 * default `getDrizzle()` return shape — see the cerebrum-db lesson in the
 * pillar-migration roadmap.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type FoodDb = BetterSQLite3Database<Record<string, unknown>>;
