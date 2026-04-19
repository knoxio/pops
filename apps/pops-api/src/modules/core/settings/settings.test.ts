import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCaller, seedSetting, setupTestContext } from '../../../shared/test-utils.js';
import { SETTINGS_KEYS } from './keys.js';
import { SettingsRegistry } from './registry.js';

import type { Database } from 'better-sqlite3';

import type { SettingsManifest } from '@pops/types';

import type { Setting } from './types.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('settings.list', () => {
  it('returns empty list when no settings exist', async () => {
    const result = await caller.core.settings.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('returns all settings', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.PLEX_URL, value: 'http://plex:32400' });
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'dark' });

    const result = await caller.core.settings.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('filters by search term', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.PLEX_URL, value: 'http://plex:32400' });
    seedSetting(db, { key: SETTINGS_KEYS.PLEX_TOKEN, value: 'abc123' });
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'dark' });

    const result = await caller.core.settings.list({ search: 'plex' });
    expect(result.data).toHaveLength(2);
    expect(result.data.map((s: Setting) => s.key)).toEqual(['plex_token', 'plex_url']);
  });

  it('paginates results', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.PLEX_URL, value: 'http://plex:32400' });
    seedSetting(db, { key: SETTINGS_KEYS.PLEX_TOKEN, value: 'abc' });
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'dark' });

    const result = await caller.core.settings.list({ limit: 2, offset: 0 });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('throws UNAUTHORIZED without auth', async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.core.settings.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.core.settings.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('settings.get', () => {
  it('returns a setting by key', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'dark' });

    const result = await caller.core.settings.get({ key: SETTINGS_KEYS.THEME });
    expect(result.data).not.toBeNull();
    expect(result.data!.key).toBe(SETTINGS_KEYS.THEME);
    expect(result.data!.value).toBe('dark');
  });

  it('returns null for missing key', async () => {
    const result = await caller.core.settings.get({ key: SETTINGS_KEYS.RADARR_URL });
    expect(result.data).toBeNull();
  });
});

describe('settings.set', () => {
  it('creates a new setting', async () => {
    const result = await caller.core.settings.set({ key: SETTINGS_KEYS.THEME, value: 'dark' });
    expect(result.message).toBe('Setting saved');
    expect(result.data.key).toBe(SETTINGS_KEYS.THEME);
    expect(result.data.value).toBe('dark');
  });

  it('updates an existing setting (upsert)', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'light' });

    const result = await caller.core.settings.set({ key: SETTINGS_KEYS.THEME, value: 'dark' });
    expect(result.data.value).toBe('dark');

    // Verify only one row exists
    const listResult = await caller.core.settings.list({ search: SETTINGS_KEYS.THEME });
    expect(listResult.data).toHaveLength(1);
  });

  it('persists to the database', async () => {
    await caller.core.settings.set({ key: SETTINGS_KEYS.RADARR_URL, value: 'http://radarr:7878' });
    const row = db
      .prepare('SELECT * FROM settings WHERE key = ?')
      .get(SETTINGS_KEYS.RADARR_URL) as {
      key: string;
      value: string;
    };
    expect(row).toBeDefined();
    expect(row.value).toBe('http://radarr:7878');
  });

  it('allows empty string value', async () => {
    const result = await caller.core.settings.set({ key: SETTINGS_KEYS.SONARR_URL, value: '' });
    expect(result.data.value).toBe('');
  });
});

describe('settings.delete', () => {
  it('deletes an existing setting', async () => {
    seedSetting(db, { key: SETTINGS_KEYS.THEME, value: 'dark' });

    const result = await caller.core.settings.delete({ key: SETTINGS_KEYS.THEME });
    expect(result.message).toBe('Setting deleted');

    // Verify it's gone
    const check = await caller.core.settings.get({ key: SETTINGS_KEYS.THEME });
    expect(check.data).toBeNull();
  });

  it('throws NOT_FOUND for missing key', async () => {
    await expect(
      caller.core.settings.delete({ key: SETTINGS_KEYS.SONARR_API_KEY })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.core.settings.delete({ key: SETTINGS_KEYS.SONARR_API_KEY })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// SettingsRegistry unit tests
// ---------------------------------------------------------------------------

function makeManifest(id: string, order: number, keys: string[]): SettingsManifest {
  return {
    id,
    title: id,
    order,
    groups: [
      {
        id: 'g',
        title: 'Group',
        fields: keys.map((key) => ({ key, label: key, type: 'text' as const })),
      },
    ],
  };
}

describe('SettingsRegistry', () => {
  it('getAll() returns manifests sorted by order', () => {
    const registry = new SettingsRegistry();
    registry.register(makeManifest('beta', 200, ['beta.key']));
    registry.register(makeManifest('alpha', 100, ['alpha.key']));

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.id).toBe('alpha');
    expect(all[1]!.id).toBe('beta');
  });

  it('throws when a key is shared between two manifests', () => {
    const registry = new SettingsRegistry();
    registry.register(makeManifest('manifest-a', 100, ['shared.key', 'a.only']));

    expect(() =>
      registry.register(makeManifest('manifest-b', 200, ['b.only', 'shared.key']))
    ).toThrow(/shared\.key.*manifest-a.*manifest-b|manifest-a.*shared\.key.*manifest-b/);
  });
});

// ---------------------------------------------------------------------------
// settings.getBulk / settings.setBulk tRPC procedure tests
// ---------------------------------------------------------------------------

describe('settings.getBulk', () => {
  it('returns only the keys that exist in the database', async () => {
    seedSetting(db, { key: 'bulk.key.1', value: 'v1' });
    seedSetting(db, { key: 'bulk.key.2', value: 'v2' });
    seedSetting(db, { key: 'bulk.key.3', value: 'v3' });

    const result = await caller.core.settings.getBulk({
      keys: ['bulk.key.1', 'bulk.key.2', 'bulk.key.3', 'bulk.key.4', 'bulk.key.5'],
    });

    expect(Object.keys(result.settings)).toHaveLength(3);
    expect(result.settings['bulk.key.1']).toBe('v1');
    expect(result.settings['bulk.key.2']).toBe('v2');
    expect(result.settings['bulk.key.3']).toBe('v3');
    expect(result.settings['bulk.key.4']).toBeUndefined();
    expect(result.settings['bulk.key.5']).toBeUndefined();
  });
});

describe('settings.setBulk', () => {
  it('saves all 3 entries and makes them retrievable', async () => {
    await caller.core.settings.setBulk({
      entries: [
        { key: 'set.bulk.a', value: 'alpha' },
        { key: 'set.bulk.b', value: 'beta' },
        { key: 'set.bulk.c', value: 'gamma' },
      ],
    });

    const result = await caller.core.settings.getBulk({
      keys: ['set.bulk.a', 'set.bulk.b', 'set.bulk.c'],
    });

    expect(Object.keys(result.settings)).toHaveLength(3);
    expect(result.settings['set.bulk.a']).toBe('alpha');
    expect(result.settings['set.bulk.b']).toBe('beta');
    expect(result.settings['set.bulk.c']).toBe('gamma');
  });

  it('rolls back all entries when one write fails mid-transaction', async () => {
    // Force a DB error on the 3rd insert by adding a trigger that aborts
    // when the settings table already has 2 rows
    db.exec(`
      CREATE TRIGGER test_settings_limit
      BEFORE INSERT ON settings
      WHEN (SELECT COUNT(*) FROM settings) >= 2
      BEGIN
        SELECT RAISE(ABORT, 'test: too many settings');
      END
    `);

    await expect(
      caller.core.settings.setBulk({
        entries: [
          { key: 'tx.key.1', value: 'v1' },
          { key: 'tx.key.2', value: 'v2' },
          { key: 'tx.key.3', value: 'v3' },
        ],
      })
    ).rejects.toThrow();

    const result = await caller.core.settings.getBulk({
      keys: ['tx.key.1', 'tx.key.2', 'tx.key.3'],
    });
    expect(Object.keys(result.settings)).toHaveLength(0);
  });
});
