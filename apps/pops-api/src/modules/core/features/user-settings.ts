import { and, eq } from 'drizzle-orm';

import { userSettings } from '@pops/db-types/schema';

import { getCoreDrizzle } from '../../../db.js';

/**
 * Per-user settings storage helpers. Backs `scope: 'user'` features and any
 * future per-user UI preferences. Keyed by `(user_email, key)`.
 */

export function getUserSetting(userEmail: string, key: string): string | null {
  const db = getCoreDrizzle();
  const row = db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userEmail, userEmail), eq(userSettings.key, key)))
    .get();
  return row?.value ?? null;
}

export function setUserSetting(userEmail: string, key: string, value: string): void {
  const db = getCoreDrizzle();
  db.insert(userSettings)
    .values({ userEmail, key, value })
    .onConflictDoUpdate({
      target: [userSettings.userEmail, userSettings.key],
      set: { value },
    })
    .run();
}

export function deleteUserSetting(userEmail: string, key: string): boolean {
  const db = getCoreDrizzle();
  const result = db
    .delete(userSettings)
    .where(and(eq(userSettings.userEmail, userEmail), eq(userSettings.key, key)))
    .run();
  return result.changes > 0;
}
