import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * The single per-pillar settings table: a flat key/value store the
 * federated RU+reset surface operates over. Storage-agnostic — each
 * pillar's own SQLite database mounts this same shape via its own
 * migration. There is no owner/namespace column: a pillar's table only
 * ever holds that pillar's declared keys.
 */
export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Persisted settings row (`{ key, value }`). */
export type SettingRow = typeof settingsTable.$inferSelect;

/**
 * A drizzle better-sqlite3 handle — either the top-level database or a
 * transaction handle. The service is generic over this so each pillar
 * injects its own connection; the module never opens a database itself.
 */
export type SettingsDb = BetterSQLite3Database<Record<string, unknown>>;
