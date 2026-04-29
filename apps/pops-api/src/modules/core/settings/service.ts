import { count, eq, inArray, like } from 'drizzle-orm';

/**
 * Settings service — key-value store for application configuration
 */
import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { SettingsKey } from './keys.js';
import type { SetSettingInput, SettingRow } from './types.js';

/** Get a single setting by key */
export function getSetting(key: SettingsKey): SettingRow {
  const db = getDrizzle();
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();

  if (!row) {
    throw new NotFoundError('Setting', key);
  }

  return row;
}

/** Get a single setting by key, returning null if not found */
export function getSettingOrNull(key: SettingsKey | string): SettingRow | null {
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
  return setRawSetting(input.key, input.value);
}

/**
 * Untyped upsert into the settings table — used by callers that own their own
 * key namespace (e.g. the feature-toggle framework, which manages keys via the
 * features registry rather than `SETTINGS_KEYS`). Prefer `setSetting` whenever
 * the key is one of the typed `SettingsKey` values.
 */
export function setRawSetting(key: string, value: string): SettingRow {
  const db = getDrizzle();

  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .run();

  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
  if (!row) {
    throw new NotFoundError('Setting', key);
  }
  return row;
}

/** Get multiple settings by key — missing keys are omitted from the result */
export function getBulkSettings(keys: string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const db = getDrizzle();
  const uniqueKeys = [...new Set(keys)];
  const rows = db.select().from(settings).where(inArray(settings.key, uniqueKeys)).all();
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

/** Write multiple settings in a single transaction — rolls back all on any failure */
export function setBulkSettings(entries: { key: string; value: string }[]): Record<string, string> {
  const db = getDrizzle();
  db.transaction((tx) => {
    for (const { key, value } of entries) {
      tx.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
  });
  // Echo the written values back — no re-read needed
  const result: Record<string, string> = {};
  for (const { key, value } of entries) result[key] = value;
  return result;
}

/**
 * Read a setting's value, returning `fallback` if the key does not exist in the
 * database or if the settings table is not available. This is the preferred way
 * for modules to consume settings — it avoids throwing on missing keys and
 * keeps the default co-located with the call site.
 */
export function getSettingValue<T extends string | number>(key: string, fallback: T): T {
  try {
    const db = getDrizzle();
    const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
    if (!row) return fallback;
    // Coerce to the same primitive type as the fallback.
    if (typeof fallback === 'number') {
      const parsed = Number(row.value);
      return (Number.isNaN(parsed) ? fallback : parsed) as T;
    }
    return row.value as T;
  } catch {
    // Settings table may not exist in test databases or during early
    // bootstrapping — gracefully degrade to the hardcoded fallback.
    return fallback;
  }
}

/** Delete a setting by key */
export function deleteSetting(key: SettingsKey): void {
  const db = getDrizzle();
  const result = db.delete(settings).where(eq(settings.key, key)).run();

  if (result.changes === 0) {
    throw new NotFoundError('Setting', key);
  }
}
