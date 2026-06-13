/**
 * Shared types for the HA bridge persistence layer.
 *
 * Mirrors the `@pops/lists-db` / `@pops/finance-db` convention so that
 * subsequent slices can drop typed service modules under `src/services/*`
 * without re-importing drizzle internals every time.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type HaBridgeDb = BetterSQLite3Database<Record<string, unknown>>;
