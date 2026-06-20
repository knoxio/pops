import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Pillar-owned key/value store for runtime-tunable rotation config.
 *
 * The cron expression, target free space, leaving-window, daily additions,
 * average movie size, protected-window, and enabled flag are tunable from the
 * UI, so unlike the env-only ARR credentials they need a writable store. The
 * media pillar cannot reach `core/settings`, so they live here. Mirrors the
 * `plex_settings` precedent: values are opaque strings the rotation settings
 * service encodes/decodes (numbers stringified, booleans as 'true'/'').
 */
export const rotationSettings = sqliteTable('rotation_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
