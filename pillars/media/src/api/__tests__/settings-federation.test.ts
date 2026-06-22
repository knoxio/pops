/**
 * Integration tests for media's federated `/settings/*` surface
 * (settings-federation S2, OD-2).
 *
 * Boots the production `createMediaApiApp` factory against a per-test temp
 * `media.db` and drives the RU+reset surface over real HTTP via supertest. The
 * load-bearing behaviour here is the translation ADAPTER: media's keys back onto
 * THREE physical tables, not the shared single `settings` table. The suite
 * asserts:
 *   - manifest defaults resolve on the collection read,
 *   - prefix routing lands each key in the right physical table
 *     (`plex_*`→`plex_settings`, `rotation_*`→`rotation_settings`,
 *     `media.*`/`radarr_*`→`settings`),
 *   - the `rotation_enabled` boolean round-trips `'true'`/`'false'` over the wire
 *     while persisting the legacy `'true'`/`''` encoding,
 *   - an upsert bumps the carve-out table's `updated_at`,
 *   - the sensitive `plex_token` is redacted on read but persisted intact,
 *   - reset re-applies the manifest default, and
 *   - a free-form write addressing an undeclared key is rejected with a 400.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REDACTED } from '@pops/pillar-settings';

import { comparisonsService, openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { plexSettings, rotationSettings, settings } from '../../db/schema.js';
import * as settingsAdapter from '../../db/services/settings-adapter.js';
import { createMediaApiApp } from '../app.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;

function app() {
  return createMediaApiApp({
    mediaDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3003',
  });
}

function rawValue(
  table: typeof plexSettings | typeof rotationSettings | typeof settings,
  key: string
) {
  return mediaDb.db
    .select({ value: table.value })
    .from(table)
    .where(sql`${table.key} = ${key}`)
    .get();
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-settings-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('media federated /settings', () => {
  it('lists every declared key resolved to its manifest default', async () => {
    const res = await request(app()).get('/settings');
    expect(res.status).toBe(200);
    const byKey = new Map<string, string>(
      (res.body.data as { key: string; value: string }[]).map((row) => [row.key, row.value])
    );
    expect(byKey.get('rotation_cron_expression')).toBe('0 3 * * *');
    expect(byKey.get('rotation_target_free_gb')).toBe('100');
    expect(byKey.get('media.comparisons.eloK')).toBe('32');
    // Toggle with no manifest default resolves to the empty string, decoded off.
    expect(byKey.get('rotation_enabled')).toBe('false');
  });

  it('routes each key prefix to its backing physical table', async () => {
    await request(app()).put('/settings/plex_url').send({ value: 'http://plex.test:32400' });
    await request(app()).put('/settings/rotation_target_free_gb').send({ value: '250' });
    await request(app()).put('/settings/radarr_url').send({ value: 'http://radarr.test' });
    await request(app()).put('/settings/media.defaultLimit').send({ value: '99' });

    expect(rawValue(plexSettings, 'plex_url')?.value).toBe('http://plex.test:32400');
    expect(rawValue(rotationSettings, 'rotation_target_free_gb')?.value).toBe('250');
    expect(rawValue(settings, 'radarr_url')?.value).toBe('http://radarr.test');
    expect(rawValue(settings, 'media.defaultLimit')?.value).toBe('99');
    // Carve-out keys must NOT leak into the residual table.
    expect(rawValue(settings, 'plex_url')).toBeUndefined();
    expect(rawValue(settings, 'rotation_target_free_gb')).toBeUndefined();
  });

  it('round-trips the rotation_enabled toggle through the legacy true/empty encoding', async () => {
    const on = await request(app()).put('/settings/rotation_enabled').send({ value: 'true' });
    expect(on.body.data).toEqual({ key: 'rotation_enabled', value: 'true' });
    expect(rawValue(rotationSettings, 'rotation_enabled')?.value).toBe('true');
    expect((await request(app()).get('/settings/rotation_enabled')).body.data.value).toBe('true');

    const off = await request(app()).put('/settings/rotation_enabled').send({ value: 'false' });
    expect(off.body.data).toEqual({ key: 'rotation_enabled', value: 'false' });
    // Disabled persists as the empty string, but reads back as the canonical 'false'.
    expect(rawValue(rotationSettings, 'rotation_enabled')?.value).toBe('');
    expect((await request(app()).get('/settings/rotation_enabled')).body.data.value).toBe('false');
  });

  it('bumps updated_at on a carve-out upsert', async () => {
    await request(app()).put('/settings/plex_url').send({ value: 'http://a' });
    const first = mediaDb.db
      .select({ createdAt: plexSettings.createdAt, updatedAt: plexSettings.updatedAt })
      .from(plexSettings)
      .where(sql`${plexSettings.key} = 'plex_url'`)
      .get();
    // Force a clock tick so the datetime('now') value differs.
    mediaDb.raw
      .prepare("UPDATE plex_settings SET updated_at = '2000-01-01 00:00:00' WHERE key = 'plex_url'")
      .run();
    await request(app()).put('/settings/plex_url').send({ value: 'http://b' });
    const second = rawValue(plexSettings, 'plex_url');
    expect(second?.value).toBe('http://b');
    const bumped = mediaDb.db
      .select({ createdAt: plexSettings.createdAt, updatedAt: plexSettings.updatedAt })
      .from(plexSettings)
      .where(sql`${plexSettings.key} = 'plex_url'`)
      .get();
    expect(bumped?.updatedAt).not.toBe('2000-01-01 00:00:00');
    expect(bumped?.createdAt).toBe(first?.createdAt);
  });

  it('redacts the sensitive plex_token on read but persists it intact', async () => {
    await request(app()).put('/settings/plex_token').send({ value: 'super-secret-ciphertext' });
    expect(rawValue(plexSettings, 'plex_token')?.value).toBe('super-secret-ciphertext');

    const single = await request(app()).get('/settings/plex_token');
    expect(single.body.data.value).toBe(REDACTED);

    const many = await request(app())
      .post('/settings/get-many')
      .send({ keys: ['plex_token', 'plex_url'] });
    expect(many.body.settings.plex_token).toBe(REDACTED);

    const collection = await request(app()).get('/settings');
    const tokenRow = (collection.body.data as { key: string; value: string }[]).find(
      (row) => row.key === 'plex_token'
    );
    expect(tokenRow?.value).toBe(REDACTED);
  });

  it('resets a single key to its manifest default and reset-all restores every default', async () => {
    await request(app()).put('/settings/rotation_target_free_gb').send({ value: '999' });
    const reset = await request(app()).post('/settings/rotation_target_free_gb/reset');
    expect(reset.body.data).toEqual({ key: 'rotation_target_free_gb', value: '100' });
    expect(rawValue(rotationSettings, 'rotation_target_free_gb')).toBeUndefined();

    await request(app()).put('/settings/media.comparisons.eloK').send({ value: '64' });
    const resetAll = await request(app()).post('/settings/reset').send({});
    expect(resetAll.status).toBe(200);
    expect(resetAll.body.settings['media.comparisons.eloK']).toBe('32');
    expect(resetAll.body.settings['rotation_cron_expression']).toBe('0 3 * * *');
  });

  it('rejects a set-many addressing an undeclared key with a 400', async () => {
    const res = await request(app())
      .post('/settings/set-many')
      .send({ entries: [{ key: 'media.notAThing', value: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a single-key write outside the declared enum with a 400', async () => {
    const res = await request(app()).put('/settings/totally.unknown').send({ value: 'x' });
    expect(res.status).toBe(400);
  });

  it('treats ensure as a write-once seed that never clobbers the landed value', async () => {
    const first = await request(app())
      .post('/settings/plex_url/ensure')
      .send({ value: 'http://first' });
    expect(first.body.data).toEqual({ key: 'plex_url', value: 'http://first' });

    const second = await request(app())
      .post('/settings/plex_url/ensure')
      .send({ value: 'http://second' });
    // The seed is preserved: the second ensure returns the originally-landed value.
    expect(second.body.data).toEqual({ key: 'plex_url', value: 'http://first' });
    expect(rawValue(plexSettings, 'plex_url')?.value).toBe('http://first');
  });
});

/**
 * Runtime-read assertions for the comparisons config readers (OD-4 / S2b,
 * GAP-256-B). Proves the readers in
 * `db/services/comparisons/config.ts` resolve the EFFECTIVE value from media's
 * pillar-local `settings` table — so an edit persisted through `/settings` takes
 * effect at runtime — falling back to the manifest default when nothing is
 * stored. These exercise the real reader against the real temp SQLite db (no
 * mocks): a table write is observed by the getter, and the unset path resolves
 * the manifest default rather than a stale `process.env`-era value.
 */
describe('comparisons config runtime reads', () => {
  it('reflects a stored override for the int eloK reader', async () => {
    expect(comparisonsService.getEloK(mediaDb.db)).toBe(32);

    await request(app()).put('/settings/media.comparisons.eloK').send({ value: '64' });
    expect(comparisonsService.getEloK(mediaDb.db)).toBe(64);
  });

  it('reflects a stored override for the float stalenessThreshold reader', async () => {
    expect(comparisonsService.getStalenessThreshold(mediaDb.db)).toBe(0.3);

    settingsAdapter.setRaw(mediaDb.db, 'media.comparisons.stalenessThreshold', '0.45');
    expect(comparisonsService.getStalenessThreshold(mediaDb.db)).toBe(0.45);
  });

  it('falls back to the manifest default for every reader when unset', () => {
    expect(comparisonsService.getEloK(mediaDb.db)).toBe(32);
    expect(comparisonsService.getDefaultScore(mediaDb.db)).toBe(1500);
    expect(comparisonsService.getMaxTierListMovies(mediaDb.db)).toBe(8);
    expect(comparisonsService.getStalenessThreshold(mediaDb.db)).toBe(0.3);
    expect(comparisonsService.getDefaultLimit(mediaDb.db)).toBe(50);
  });

  it('resets restore the manifest default the reader observes', async () => {
    await request(app()).put('/settings/media.comparisons.eloK').send({ value: '64' });
    expect(comparisonsService.getEloK(mediaDb.db)).toBe(64);

    await request(app()).post('/settings/media.comparisons.eloK/reset');
    expect(comparisonsService.getEloK(mediaDb.db)).toBe(32);
  });
});
