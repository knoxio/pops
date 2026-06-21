import { eq, inArray } from 'drizzle-orm';

import { settingsTable, type SettingRow, type SettingsDb } from './schema.js';

import type { KeyDefaults } from './manifest-keys.js';

/** A key/value pair accepted by the write paths. */
export interface SettingEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * Read one stored override. Returns `null` when the key has no stored
 * row (the caller applies the manifest default). Does NOT resolve the
 * default itself — {@link listEffective} is the effective-value path.
 */
export function getOrNull(db: SettingsDb, key: string): SettingRow | null {
  return db.select().from(settingsTable).where(eq(settingsTable.key, key)).get() ?? null;
}

/**
 * Batch-read stored overrides by key. Missing keys are omitted (absence
 * means "not set"). Duplicate input keys are de-duped before the query.
 */
export function getBulk(db: SettingsDb, keys: readonly string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const uniqueKeys = [...new Set(keys)];
  const rows = db.select().from(settingsTable).where(inArray(settingsTable.key, uniqueKeys)).all();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * The effective value set for a pillar: every declared key resolved to
 * its stored override, else its manifest default, else the empty string.
 * This is what the collection read (`GET /settings`) returns.
 */
export function listEffective(db: SettingsDb, kd: KeyDefaults): SettingRow[] {
  const overrides = getBulk(db, kd.keys);
  return kd.keys.map((key) => ({ key, value: overrides[key] ?? kd.defaults[key] ?? '' }));
}

/**
 * Upsert a single setting (UPDATE). Returns the persisted row. The value
 * is stored verbatim — writes are never redacted.
 */
export function setRaw(db: SettingsDb, key: string, value: string): SettingRow {
  db.insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
    .run();
  return { key, value };
}

/**
 * Transactional batch write (UPDATE) — every entry lands or none do.
 * Returns a mirror of the written entries (key → value) without
 * re-reading the table.
 */
export function setBulk(db: SettingsDb, entries: readonly SettingEntry[]): Record<string, string> {
  if (entries.length === 0) return {};
  db.transaction((tx) => {
    for (const { key, value } of entries) {
      tx.insert(settingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
        .run();
    }
  });
  const out: Record<string, string> = {};
  for (const { key, value } of entries) out[key] = value;
  return out;
}

/**
 * Write-once seed for values that must stay stable for the install's
 * lifetime (encryption seed, generated client id). Inserts with
 * `ON CONFLICT DO NOTHING`, so concurrent first-time callers converge on
 * the row that landed first. INTERNAL-ONLY — not part of the user-facing
 * RU+reset surface.
 */
export function ensure(db: SettingsDb, key: string, value: string): SettingRow {
  db.insert(settingsTable)
    .values({ key, value })
    .onConflictDoNothing({ target: settingsTable.key })
    .run();
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, key)).get();
  return row ?? { key, value };
}

/**
 * RESET a single declared key to its manifest default by deleting any
 * stored override (idempotent — no throw on miss). Returns the resolved
 * default value the next read would now observe.
 */
export function resetSetting(db: SettingsDb, key: string, kd: KeyDefaults): SettingRow {
  db.delete(settingsTable).where(eq(settingsTable.key, key)).run();
  return { key, value: kd.defaults[key] ?? '' };
}

/** The outcome of a batch reset: the keys reset and their resolved defaults. */
export interface ResetResult {
  readonly reset: readonly string[];
  readonly settings: Readonly<Record<string, string>>;
}

/**
 * RESET declared keys to their manifest defaults transactionally. With
 * `keys` omitted (or empty) ALL declared keys are reset; otherwise only
 * the supplied keys that are actually declared (unknown keys are ignored,
 * never written). Returns the reset keys and their resolved defaults.
 */
export function resetSettings(
  db: SettingsDb,
  keys: readonly string[] | undefined,
  kd: KeyDefaults
): ResetResult {
  const declared = new Set(kd.keys);
  const target = keys && keys.length > 0 ? keys.filter((key) => declared.has(key)) : [...kd.keys];

  db.transaction((tx) => {
    for (const key of target) tx.delete(settingsTable).where(eq(settingsTable.key, key)).run();
  });

  const settings: Record<string, string> = {};
  for (const key of target) settings[key] = kd.defaults[key] ?? '';
  return { reset: target, settings };
}
