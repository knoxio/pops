/**
 * Pillar-owned key/value store for runtime-tunable rotation config.
 *
 * The media pillar cannot reach `core/settings`, so the rotation settings the
 * UI tunes (cron expression, target free GB, leaving days, daily additions,
 * average movie GB, protected days, enabled flag) live in the local
 * `rotation_settings` table. Values are opaque strings; the rotation handler
 * owns their encoding. HTTP-free; `(db, …)`-arg. Mirrors `plex-settings.ts`.
 */
import { inArray, sql } from 'drizzle-orm';

import { rotationSettings } from '../../schema.js';

import type { MediaDb } from '../internal.js';

/** Read a single setting value, or `null` when the key is unset. */
export function get(db: MediaDb, key: string): string | null {
  const row = db
    .select({ value: rotationSettings.value })
    .from(rotationSettings)
    .where(sql`${rotationSettings.key} = ${key}`)
    .get();
  return row?.value ?? null;
}

/** Upsert a setting, refreshing `updatedAt` on conflict. */
export function set(db: MediaDb, key: string, value: string): void {
  db.insert(rotationSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: rotationSettings.key,
      set: { value, updatedAt: sql`(datetime('now'))` },
    })
    .run();
}

/**
 * Fetch many settings at once. Returns a `key → value` map containing only the
 * keys that are present (missing keys are omitted, not `null`).
 */
export function getMany(db: MediaDb, keys: string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const rows = db
    .select({ key: rotationSettings.key, value: rotationSettings.value })
    .from(rotationSettings)
    .where(inArray(rotationSettings.key, keys))
    .all();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/** Upsert a batch of settings in one transaction. */
export function setMany(db: MediaDb, entries: ReadonlyArray<{ key: string; value: string }>): void {
  if (entries.length === 0) return;
  db.transaction((tx) => {
    for (const entry of entries) {
      tx.insert(rotationSettings)
        .values({ key: entry.key, value: entry.value })
        .onConflictDoUpdate({
          target: rotationSettings.key,
          set: { value: entry.value, updatedAt: sql`(datetime('now'))` },
        })
        .run();
    }
  });
}
