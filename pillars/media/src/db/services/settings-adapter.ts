/**
 * Translation adapter backing media's federated `/settings/*` surface
 * (settings-federation S2, OD-2; see `docs/plans/02-settings-federation.md`).
 *
 * Media keeps its pre-existing carve-out tables (`plex_settings`,
 * `rotation_settings`) as the backing store for the federated surface rather
 * than collapsing them into the shared single `settings` table. This adapter
 * reconciles the three concerns that prevent the shared `@pops/pillar-settings`
 * service from operating over them directly:
 *
 *   1. Prefix routing — `plex_*` → `plex_settings`; `rotation_*` →
 *      `rotation_settings`; everything else (`media.*`, `radarr_*`, `sonarr_*`)
 *      → the residual shared `settings` table.
 *   2. Column reconciliation — `plex_settings`/`rotation_settings` carry
 *      `created_at`/`updated_at` the shared table lacks. Upserts bump
 *      `updated_at`; `created_at` is left to the column default on insert.
 *   3. Boolean value-encoding — `rotation_enabled`/`plex_scheduler_enabled`
 *      persist as `'true'`/`''` (the legacy rotation/plex scheduler encoding),
 *      while the manifest toggle round-trips `'true'`/`'false'`. The adapter
 *      encodes on write and decodes on read so the wire value stays canonical.
 *      A reset deletes the row, so the next decoded read yields the default.
 *
 * The function surface mirrors the shared service (`getOrNull`, `getBulk`,
 * `listEffective`, `setRaw`, `setBulk`, `resetSetting`, `resetSettings`,
 * `ensure`) so media's settings handlers compose against it identically.
 */
import { eq, sql } from 'drizzle-orm';

import { type KeyDefaults, type SettingEntry, type SettingRow } from '@pops/pillar-settings';

import { plexSettings, rotationSettings, settings } from '../schema.js';

import type { MediaDb } from './internal.js';

/** A drizzle better-sqlite3 kv table with a `key` PK and a `value` column. */
type KvTable = typeof plexSettings | typeof rotationSettings | typeof settings;

/**
 * Keys whose stored form is the legacy `'true'`/`''` boolean encoding but whose
 * federated wire form is the canonical `'true'`/`'false'` toggle. The `plex_*`
 * scheduler flag and the rotation enable flag both follow this convention.
 */
const BOOLEAN_KEYS = new Set(['rotation_enabled', 'plex_scheduler_enabled']);

/** Resolve the physical kv table a key routes to by prefix. */
function tableFor(key: string): KvTable {
  if (key.startsWith('plex_')) return plexSettings;
  if (key.startsWith('rotation_')) return rotationSettings;
  return settings;
}

/** Whether a key routes to a carve-out table that owns `updated_at`. */
function bumpsUpdatedAt(table: KvTable): boolean {
  return table === plexSettings || table === rotationSettings;
}

/** Encode a canonical wire value into its stored form for boolean keys. */
function encode(key: string, value: string): string {
  if (!BOOLEAN_KEYS.has(key)) return value;
  return value === 'true' ? 'true' : '';
}

/** Decode a stored value into its canonical wire form for boolean keys. */
function decode(key: string, value: string): string {
  if (!BOOLEAN_KEYS.has(key)) return value;
  return value === 'true' ? 'true' : 'false';
}

function readRaw(db: MediaDb, key: string): string | null {
  const table = tableFor(key);
  const row = db.select({ value: table.value }).from(table).where(eq(table.key, key)).get();
  return row?.value ?? null;
}

function writeRaw(db: MediaDb, key: string, value: string): void {
  const table = tableFor(key);
  const set = bumpsUpdatedAt(table) ? { value, updatedAt: sql`(datetime('now'))` } : { value };
  db.insert(table).values({ key, value }).onConflictDoUpdate({ target: table.key, set }).run();
}

function deleteRaw(db: MediaDb, key: string): void {
  const table = tableFor(key);
  db.delete(table).where(eq(table.key, key)).run();
}

/**
 * Read one stored override decoded to its wire form. Returns `null` when the
 * key has no stored row (the caller applies the manifest default). Does NOT
 * resolve the default itself — {@link listEffective} is the effective path.
 */
export function getOrNull(db: MediaDb, key: string): SettingRow | null {
  const stored = readRaw(db, key);
  if (stored === null) return null;
  return { key, value: decode(key, stored) };
}

/**
 * Batch-read stored overrides by key, decoded to wire form. Missing keys are
 * omitted (absence means "not set"). Duplicate input keys are de-duped.
 */
export function getBulk(db: MediaDb, keys: readonly string[]): Record<string, string> {
  if (keys.length === 0) return {};
  const out: Record<string, string> = {};
  for (const key of new Set(keys)) {
    const stored = readRaw(db, key);
    if (stored !== null) out[key] = decode(key, stored);
  }
  return out;
}

/**
 * The effective value set: every declared key resolved to its stored override
 * (decoded), else its manifest default, else the empty string. This is what the
 * collection read (`GET /settings`) returns.
 */
export function listEffective(db: MediaDb, kd: KeyDefaults): SettingRow[] {
  return kd.keys.map((key) => {
    const stored = readRaw(db, key);
    const raw = stored ?? kd.defaults[key] ?? '';
    return { key, value: decode(key, raw) };
  });
}

/**
 * Upsert a single setting (UPDATE). Encodes boolean keys to their stored form,
 * bumps `updated_at` for carve-out tables, and returns the persisted wire row.
 */
export function setRaw(db: MediaDb, key: string, value: string): SettingRow {
  writeRaw(db, key, encode(key, value));
  return { key, value };
}

/**
 * Transactional batch write (UPDATE) — every entry lands or none do. Returns a
 * mirror of the written wire entries (key → value) without re-reading.
 */
export function setBulk(db: MediaDb, entries: readonly SettingEntry[]): Record<string, string> {
  if (entries.length === 0) return {};
  db.transaction(() => {
    for (const { key, value } of entries) writeRaw(db, key, encode(key, value));
  });
  const out: Record<string, string> = {};
  for (const { key, value } of entries) out[key] = value;
  return out;
}

/**
 * Write-once seed (encryption seed / generated client id). Inserts only when
 * absent, then returns the resolved wire row. INTERNAL-ONLY — not part of the
 * user-facing RU+reset surface.
 */
export function ensure(db: MediaDb, key: string, value: string): SettingRow {
  const existing = readRaw(db, key);
  if (existing !== null) return { key, value: decode(key, existing) };
  writeRaw(db, key, encode(key, value));
  return { key, value };
}

/**
 * RESET a single declared key to its manifest default by deleting any stored
 * override (idempotent). Returns the default value the next read would observe.
 */
export function resetSetting(db: MediaDb, key: string, kd: KeyDefaults): SettingRow {
  deleteRaw(db, key);
  return { key, value: kd.defaults[key] ?? '' };
}

/** The outcome of a batch reset: the keys reset and their resolved defaults. */
export interface ResetResult {
  readonly reset: readonly string[];
  readonly settings: Readonly<Record<string, string>>;
}

/**
 * RESET declared keys to their manifest defaults transactionally. With `keys`
 * omitted (or empty) ALL declared keys are reset; otherwise only the supplied
 * keys that are actually declared (unknown keys are ignored). Returns the reset
 * keys and their resolved defaults.
 */
export function resetSettings(
  db: MediaDb,
  keys: readonly string[] | undefined,
  kd: KeyDefaults
): ResetResult {
  const declared = new Set(kd.keys);
  const target = keys && keys.length > 0 ? keys.filter((key) => declared.has(key)) : [...kd.keys];
  db.transaction(() => {
    for (const key of target) deleteRaw(db, key);
  });
  const out: Record<string, string> = {};
  for (const key of target) out[key] = kd.defaults[key] ?? '';
  return { reset: target, settings: out };
}
