/**
 * Invariant tests for the settings service against an in-memory SQLite
 * seeded with the canonical `0056_settings_baseline.sql` migration. Pure
 * DB + service layer — no tRPC, no Express, no feature-toggle wiring.
 *
 * Higher-level router-level coverage continues to live in pops-api's own
 * suite (`apps/pops-api/src/modules/core/settings/settings.test.ts`) and
 * exercises the same persisted shape via the in-tree shim until PRD-183
 * PR 3 flips it onto this service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { SettingNotFoundError } from '../errors.js';
import {
  deleteSetting,
  getBulkSettings,
  getSetting,
  getSettingOrNull,
  getSettingValue,
  listSettings,
  setBulkSettings,
  setRawSetting,
  setSetting,
} from '../services/settings.js';

import type { CoreDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0056_settings_baseline.sql');

function freshDb(): CoreDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

describe('setSetting / setRawSetting', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new key and returns the persisted row', () => {
    const row = setSetting(db, { key: 'ui.theme', value: 'dark' });
    expect(row).toEqual({ key: 'ui.theme', value: 'dark' });
  });

  it('updates an existing key on the second call (UPSERT)', () => {
    setSetting(db, { key: 'ui.theme', value: 'dark' });
    const row = setSetting(db, { key: 'ui.theme', value: 'light' });
    expect(row.value).toBe('light');
    const all = listSettings(db, undefined, 10, 0);
    expect(all.total).toBe(1);
  });

  it('setRawSetting accepts an arbitrary key namespace', () => {
    const row = setRawSetting(db, 'feature.flag.beta', 'true');
    expect(row).toEqual({ key: 'feature.flag.beta', value: 'true' });
  });
});

describe('getSetting / getSettingOrNull', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('getSetting returns the persisted row', () => {
    setSetting(db, { key: 'k', value: 'v' });
    expect(getSetting(db, 'k')).toEqual({ key: 'k', value: 'v' });
  });

  it('getSetting throws SettingNotFoundError on miss', () => {
    expect(() => getSetting(db, 'missing')).toThrow(SettingNotFoundError);
  });

  it('getSettingOrNull returns null on miss without throwing', () => {
    expect(getSettingOrNull(db, 'missing')).toBeNull();
  });

  it('getSettingOrNull returns the row when present', () => {
    setSetting(db, { key: 'k', value: 'v' });
    expect(getSettingOrNull(db, 'k')).toEqual({ key: 'k', value: 'v' });
  });
});

describe('listSettings', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    setSetting(db, { key: 'ai.model', value: 'sonnet' });
    setSetting(db, { key: 'ai.modelOverrides.query', value: 'haiku' });
    setSetting(db, { key: 'ui.theme', value: 'dark' });
  });

  it('returns rows ordered by key with the total count', () => {
    const result = listSettings(db, undefined, 10, 0);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.key)).toEqual([
      'ai.model',
      'ai.modelOverrides.query',
      'ui.theme',
    ]);
  });

  it('respects limit + offset for pagination', () => {
    const result = listSettings(db, undefined, 1, 1);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.key)).toEqual(['ai.modelOverrides.query']);
  });

  it('filters by key LIKE when `search` is set', () => {
    const result = listSettings(db, 'ai.', 10, 0);
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.key)).toEqual(['ai.model', 'ai.modelOverrides.query']);
  });

  it('returns zero rows when the search matches nothing', () => {
    const result = listSettings(db, 'nope', 10, 0);
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

describe('getBulkSettings', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    setSetting(db, { key: 'a', value: '1' });
    setSetting(db, { key: 'b', value: '2' });
  });

  it('returns the requested key→value map', () => {
    expect(getBulkSettings(db, ['a', 'b'])).toEqual({ a: '1', b: '2' });
  });

  it('omits missing keys from the result', () => {
    expect(getBulkSettings(db, ['a', 'missing'])).toEqual({ a: '1' });
  });

  it('short-circuits to {} when given an empty input', () => {
    expect(getBulkSettings(db, [])).toEqual({});
  });

  it('de-dupes the input before the IN clause', () => {
    expect(getBulkSettings(db, ['a', 'a', 'a'])).toEqual({ a: '1' });
  });
});

describe('setBulkSettings', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts every entry in a single transaction', () => {
    const written = setBulkSettings(db, [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(written).toEqual({ a: '1', b: '2' });
    expect(listSettings(db, undefined, 10, 0).total).toBe(2);
  });

  it('upserts existing keys without inserting duplicates', () => {
    setSetting(db, { key: 'a', value: 'old' });
    const written = setBulkSettings(db, [{ key: 'a', value: 'new' }]);
    expect(written).toEqual({ a: 'new' });
    const result = listSettings(db, undefined, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]).toEqual({ key: 'a', value: 'new' });
  });

  it('is a no-op for an empty input', () => {
    expect(setBulkSettings(db, [])).toEqual({});
    expect(listSettings(db, undefined, 10, 0).total).toBe(0);
  });
});

describe('getSettingValue', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the persisted string when present', () => {
    setSetting(db, { key: 'ui.theme', value: 'dark' });
    expect(getSettingValue(db, 'ui.theme', 'light')).toBe('dark');
  });

  it('returns the fallback when the key is missing', () => {
    expect(getSettingValue(db, 'ui.theme', 'light')).toBe('light');
  });

  it('coerces to number when the fallback is numeric', () => {
    setSetting(db, { key: 'limit', value: '42' });
    expect(getSettingValue(db, 'limit', 10)).toBe(42);
  });

  it('returns the fallback when the persisted value is not a number', () => {
    setSetting(db, { key: 'limit', value: 'oops' });
    expect(getSettingValue(db, 'limit', 10)).toBe(10);
  });
});

describe('deleteSetting', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row and a subsequent get throws SettingNotFoundError', () => {
    setSetting(db, { key: 'k', value: 'v' });
    deleteSetting(db, 'k');
    expect(() => getSetting(db, 'k')).toThrow(SettingNotFoundError);
  });

  it('throws SettingNotFoundError when the key is missing', () => {
    expect(() => deleteSetting(db, 'missing')).toThrow(SettingNotFoundError);
  });
});
