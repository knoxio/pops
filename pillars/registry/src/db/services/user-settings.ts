/**
 * Per-user settings storage against the core pillar's SQLite via drizzle.
 *
 * Backs `scope: 'user'` features (the per-user override that resolves ahead
 * of the system default) and any future per-user UI preference. Keyed by
 * `(user_email, key)` — the same `user_settings` table the existing
 * cross-pillar `users` reconciliation surface already reads. No new table.
 *
 * Services take a `CoreDb` handle as their first argument; the calling layer
 * resolves the singleton or transaction handle to pass in. Mirrors the
 * sibling `settings` service signature.
 */
import { and, eq } from 'drizzle-orm';

import { userSettings } from '../schema/user-settings.js';

import type { CoreDb } from './internal.js';

/** Read a single per-user setting value; returns `null` if the key is absent. */
export function getUserSetting(db: CoreDb, userEmail: string, key: string): string | null {
  const row = db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userEmail, userEmail), eq(userSettings.key, key)))
    .get();
  return row?.value ?? null;
}

/** Upsert a per-user setting value, keyed by `(user_email, key)`. */
export function setUserSetting(db: CoreDb, userEmail: string, key: string, value: string): void {
  db.insert(userSettings)
    .values({ userEmail, key, value })
    .onConflictDoUpdate({
      target: [userSettings.userEmail, userSettings.key],
      set: { value },
    })
    .run();
}

/**
 * Delete a per-user setting. Returns `true` if a row was removed, `false`
 * if no override existed. Atomic — relies on the DELETE's `changes` count.
 */
export function deleteUserSetting(db: CoreDb, userEmail: string, key: string): boolean {
  const result = db
    .delete(userSettings)
    .where(and(eq(userSettings.userEmail, userEmail), eq(userSettings.key, key)))
    .run();
  return result.changes > 0;
}
