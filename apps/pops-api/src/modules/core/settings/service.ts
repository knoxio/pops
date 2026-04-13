/**
 * Settings service — key-value store for application configuration
 */
import { settings } from '@pops/db-types';
import { count, eq, like } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import type { SetSettingInput, SettingRow } from './types.js';

/** Get a single setting by key */
export function getSetting(key: string): SettingRow {
  const db = getDrizzle();
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();

  if (!row) {
    throw new NotFoundError('Setting', key);
  }

  return row;
}

/** Get a single setting by key, returning null if not found */
export function getSettingOrNull(key: string): SettingRow | null {
  const db = getDrizzle();
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
  return row ?? null;
}

/** List settings with optional search filter */
export function listSettings(
  search: string | undefined,
  limit: number,
  offset: number
): { rows: SettingRow[]; total: number } {
  const db = getDrizzle();

  const condition = search ? like(settings.key, `%${search}%`) : undefined;

  const [countResult] = db.select({ count: count() }).from(settings).where(condition).all();

  const rows = db
    .select()
    .from(settings)
    .where(condition)
    .orderBy(settings.key)
    .limit(limit)
    .offset(offset)
    .all();

  return { rows, total: countResult?.count ?? 0 };
}

/** Set a setting value (upsert — creates or updates) */
export function setSetting(input: SetSettingInput): SettingRow {
  const db = getDrizzle();

  db.insert(settings)
    .values({ key: input.key, value: input.value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: input.value },
    })
    .run();

  return getSetting(input.key);
}

/** Delete a setting by key */
export function deleteSetting(key: string): void {
  const db = getDrizzle();
  const result = db.delete(settings).where(eq(settings.key, key)).run();

  if (result.changes === 0) {
    throw new NotFoundError('Setting', key);
  }
}
