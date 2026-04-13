import { TRPCError } from '@trpc/server';
import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCaller, seedSetting, setupTestContext } from '../../../shared/test-utils.js';
import { SETTINGS_KEYS } from './keys.js';

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
    expect(result.data.map((s) => s.key)).toEqual(['plex_token', 'plex_url']);
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
