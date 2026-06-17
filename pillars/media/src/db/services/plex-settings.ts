/**
 * Pillar-owned key/value store for Plex connection state.
 *
 * The media pillar cannot reach `core/settings`, so the Plex URL,
 * encrypted token, username, client identifier, encryption seed, and
 * library section ids are persisted in the local `plex_settings` table.
 *
 * Services take a `MediaDb` handle as their first argument and are
 * HTTP-free; the calling layer (`src/api/clients/plex/`) is responsible
 * for resolving the handle. Mirrors the other media services' signature.
 */
import { inArray, sql } from 'drizzle-orm';

import { plexSettings } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Read a single setting value, or `null` when the key is unset. */
export function getSetting(db: MediaDb, key: string): string | null {
  const row = db
    .select({ value: plexSettings.value })
    .from(plexSettings)
    .where(sql`${plexSettings.key} = ${key}`)
    .get();
  return row?.value ?? null;
}

/** Upsert a setting, refreshing `updatedAt` on conflict. */
export function setSetting(db: MediaDb, key: string, value: string): void {
  db.insert(plexSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: plexSettings.key,
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
    .run();
}

/** Delete a setting. No-op when the key is absent. */
export function deleteSetting(db: MediaDb, key: string): void {
  db.delete(plexSettings)
    .where(sql`${plexSettings.key} = ${key}`)
    .run();
}

/**
 * Fetch many settings at once. Returns a map of `key → value` containing
 * only the keys that are present (missing keys are omitted, not `null`).
 */
export function getMany(db: MediaDb, keys: string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const rows = db
    .select({ key: plexSettings.key, value: plexSettings.value })
    .from(plexSettings)
    .where(inArray(plexSettings.key, keys))
    .all();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}
