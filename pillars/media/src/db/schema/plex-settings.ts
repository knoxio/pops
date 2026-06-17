import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Pillar-owned key/value store for Plex connection state.
 *
 * The media pillar cannot reach `core/settings` (it stands alone of
 * pops-api in the dependency graph), so the Plex URL, encrypted token,
 * username, client identifier, encryption seed, and library section ids
 * live here instead. Values are opaque strings; the Plex service owns
 * their encoding (the token is AES-256-GCM ciphertext, base64-encoded).
 */
export const plexSettings = sqliteTable('plex_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
