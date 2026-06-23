/**
 * Settings CRUD against the core pillar's SQLite via drizzle.
 *
 * Services take a `CoreDb` handle as their first argument; the calling
 * layer (pops-api modules) is responsible for resolving the singleton
 * or transaction handle to pass in. Mirrors `@pops/finance-db`'s
 * service signature pattern.
 *
 * The in-tree service in `apps/pops-api/src/modules/core/settings/`
 * still routes through the shared `getDrizzle()` handle for now —
 * PRD-183 PR 3 flips that to `getCoreDrizzle()` and routes through
 * this module.
 */
import { count, eq, inArray, like } from 'drizzle-orm';

import { SettingNotFoundError } from '../errors.js';
import { settings } from '../schema.js';

import type { CoreDb } from './internal.js';

/** Raw drizzle row shape — the persisted settings record. */
export type SettingRow = typeof settings.$inferSelect;

/** Public alias for the persisted setting row. */
export type Setting = SettingRow;

/** Count + rows for a paginated list. */
export interface SettingListResult {
  rows: SettingRow[];
  total: number;
}

/** Input for setting a value (upsert). */
export interface SetSettingInput {
  key: string;
  value: string;
}

/**
 * Read a single setting. Throws `SettingNotFoundError` if the key is
 * absent. Prefer {@link getSettingOrNull} for caller-controlled
 * fallback semantics.
 */
export function getSetting(db: CoreDb, key: string): SettingRow {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) throw new SettingNotFoundError(key);
  return row;
}

/** Read a single setting; returns `null` if the key is absent. */
export function getSettingOrNull(db: CoreDb, key: string): SettingRow | null {
  return db.select().from(settings).where(eq(settings.key, key)).get() ?? null;
}

/**
 * Read multiple settings by key. Missing keys are omitted from the
 * result. Duplicate input keys are de-duped before the IN clause.
 */
export function getBulkSettings(db: CoreDb, keys: readonly string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const uniqueKeys = [...new Set(keys)];
  const rows = db.select().from(settings).where(inArray(settings.key, uniqueKeys)).all();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * List settings ordered by key with an optional substring filter on
 * the key. Returns the paginated rows + the total count under the
 * same filter (so callers can render pagination controls without a
 * second round-trip).
 */
export function listSettings(
  db: CoreDb,
  search: string | undefined,
  limit: number,
  offset: number
): SettingListResult {
  const condition = search ? like(settings.key, `%${search}%`) : undefined;

  const countRow = db.select({ total: count() }).from(settings).where(condition).get();
  const rows = db
    .select()
    .from(settings)
    .where(condition)
    .orderBy(settings.key)
    .limit(limit)
    .offset(offset)
    .all();

  return { rows, total: countRow?.total ?? 0 };
}

/**
 * Upsert a setting. Returns the persisted row. Equivalent to
 * {@link setRawSetting} — the typed signature is for callers that
 * already have a {@link SetSettingInput} from a validated payload.
 */
export function setSetting(db: CoreDb, input: SetSettingInput): SettingRow {
  return setRawSetting(db, input.key, input.value);
}

/**
 * Untyped upsert into the settings table — used by callers that own
 * their own key namespace (e.g. the feature-toggle framework, which
 * manages keys via the features registry rather than the typed key set).
 * Prefer {@link setSetting} when the key is part of the typed key set.
 */
export function setRawSetting(db: CoreDb, key: string, value: string): SettingRow {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .run();

  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) throw new SettingNotFoundError(key);
  return row;
}

/**
 * Write-once insert for settings whose value must be stable for the
 * lifetime of the install — e.g. an encryption seed, or a generated
 * client identifier whose change would invalidate previously-derived
 * state. Inserts with `ON CONFLICT DO NOTHING` and then re-reads, so
 * concurrent first-time callers all converge on the same persisted
 * value (the row that landed first) instead of clobbering each other
 * via the upsert path. Returns the persisted row.
 */
export function ensureSetting(db: CoreDb, key: string, value: string): SettingRow {
  db.insert(settings).values({ key, value }).onConflictDoNothing({ target: settings.key }).run();

  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) throw new SettingNotFoundError(key);
  return row;
}

/**
 * Write multiple settings inside a single SQLite transaction — either
 * every row lands or none of them do. Returns a mirror of the written
 * entries (key → value) without re-reading the table.
 */
export function setBulkSettings(
  db: CoreDb,
  entries: readonly SetSettingInput[]
): Record<string, string> {
  if (entries.length === 0) return {};
  db.transaction((tx) => {
    for (const { key, value } of entries) {
      tx.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
  });
  const out: Record<string, string> = {};
  for (const { key, value } of entries) out[key] = value;
  return out;
}

/**
 * Read a setting's value, returning `fallback` if the key does not
 * exist. The default is coerced to match the `fallback` primitive
 * type so a string-valued column can serve a numeric caller without
 * the caller having to parse. NaN coercion falls back to the default
 * rather than silently propagating.
 */
export function getSettingValue<T extends string | number>(
  db: CoreDb,
  key: string,
  fallback: T
): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  if (typeof fallback === 'number') {
    const parsed = Number(row.value);
    return (Number.isNaN(parsed) ? fallback : parsed) as T;
  }
  return row.value as T;
}

/**
 * Delete a setting by key. Throws `SettingNotFoundError` if no row
 * matched (`changes === 0`) — mirrors the in-tree pops-api service
 * so PRD-183 PR 3 can swap the handle without altering the error
 * contract observable from callers.
 */
export function deleteSetting(db: CoreDb, key: string): void {
  const result = db.delete(settings).where(eq(settings.key, key)).run();
  if (result.changes === 0) throw new SettingNotFoundError(key);
}
