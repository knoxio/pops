/**
 * Shared helpers for the media schema service layer.
 *
 * Only `MediaDb` is re-exported from the package barrel so callers can type
 * the handle they pass in; any additional helpers added here stay internal
 * to `src/services/*.ts`. Follows the standard per-pillar db-handle alias.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type MediaDb = BetterSQLite3Database<Record<string, unknown>>;
