/**
 * Tests for the singleton scheduler controller + the `getSyncLogs` REST
 * route (slice 9c).
 *
 * The tick runner is mocked at the module boundary so the controller is
 * exercised without a real Plex client. The recursive timer is driven with
 * `vi.useFakeTimers()` (restored in `afterEach`) so no real interval leaks
 * between tests. `plexScheduler._reset()` clears the module-level singleton
 * state after every test.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, syncLogsService, type OpenedMediaDb } from '../../../db/index.js';
import { plexSettingsService } from '../../../db/index.js';
import { makeClient } from '../../__tests__/test-utils.js';
import { createMediaApiApp } from '../../app.js';
import { PLEX_KEYS } from '../../clients/plex/keys.js';
import { plexScheduler } from '../plex-scheduler.js';

import type { Express } from 'express';

const runTickMock = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

vi.mock('../plex-scheduler-tick.js', () => ({
  runPlexSyncTick: runTickMock,
}));

let tmpDir: string;
let opened: OpenedMediaDb;

function app(): Express {
  return createMediaApiApp({
    mediaDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3003',
  });
}

function seedLog(over: Partial<Parameters<typeof syncLogsService.writeSyncLog>[1]> = {}): void {
  syncLogsService.writeSyncLog(opened.db, {
    syncedAt: new Date().toISOString(),
    moviesSynced: 5,
    tvShowsSynced: 2,
    errors: null,
    durationMs: 42,
    ...over,
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-scheduler-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  runTickMock.mockResolvedValue(undefined);
});

afterEach(() => {
  plexScheduler._reset();
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('plexScheduler controller', () => {
  it('start → isRunning true, fires one immediate tick, then stop → isRunning false', async () => {
    vi.useFakeTimers();
    try {
      const status = plexScheduler.start({ db: opened.db, intervalMs: 1_000 });
      expect(status.isRunning).toBe(true);
      expect(status.intervalMs).toBe(1_000);

      await vi.runOnlyPendingTimersAsync();
      expect(runTickMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(plexScheduler.status(opened.db).isRunning).toBe(true);

      plexScheduler.stop();
      expect(plexScheduler.status(opened.db).isRunning).toBe(false);

      const callsAfterStop = runTickMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(runTickMock.mock.calls.length).toBe(callsAfterStop);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists enabled+interval on start and disabled on stop', () => {
    vi.useFakeTimers();
    try {
      plexScheduler.start({ db: opened.db, intervalMs: 7_000 });
      expect(plexSettingsService.getSetting(opened.db, PLEX_KEYS.schedulerEnabled)).toBe('true');
      expect(plexSettingsService.getSetting(opened.db, PLEX_KEYS.schedulerIntervalMs)).toBe('7000');

      plexScheduler.stop();
      expect(plexSettingsService.getSetting(opened.db, PLEX_KEYS.schedulerEnabled)).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arms recursively (next tick only after the current one finishes)', async () => {
    vi.useFakeTimers();
    try {
      plexScheduler.start({ db: opened.db, intervalMs: 1_000 });
      await vi.runOnlyPendingTimersAsync();
      const afterImmediate = runTickMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(runTickMock.mock.calls.length).toBeGreaterThan(afterImmediate);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runOnce drives a single tick without arming a timer', async () => {
    await plexScheduler.runOnce(opened.db);
    expect(runTickMock).toHaveBeenCalledOnce();
    expect(plexScheduler.status(opened.db).isRunning).toBe(false);
  });

  it('status surfaces the last sync-log counts + error from the db', () => {
    seedLog({ moviesSynced: 9, tvShowsSynced: 4, errors: ['boom'] });
    const status = plexScheduler.status(opened.db);
    expect(status.moviesSynced).toBe(9);
    expect(status.tvShowsSynced).toBe(4);
    expect(status.lastSyncError).toBe('boom');
    expect(status.lastSyncAt).not.toBeNull();
  });

  it('resumeIfEnabled starts with the persisted interval', () => {
    vi.useFakeTimers();
    try {
      plexSettingsService.setSetting(opened.db, PLEX_KEYS.schedulerEnabled, 'true');
      plexSettingsService.setSetting(opened.db, PLEX_KEYS.schedulerIntervalMs, '12345');

      const status = plexScheduler.resumeIfEnabled(opened.db);
      expect(status?.isRunning).toBe(true);
      expect(status?.intervalMs).toBe(12_345);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumeIfEnabled is a no-op when the persisted flag is not "true"', () => {
    plexSettingsService.setSetting(opened.db, PLEX_KEYS.schedulerEnabled, 'false');
    expect(plexScheduler.resumeIfEnabled(opened.db)).toBeNull();
    expect(plexScheduler.status(opened.db).isRunning).toBe(false);
  });
});

describe('plex scheduler — REST', () => {
  it('GET /plex/scheduler/sync-logs returns rows newest-first', async () => {
    seedLog({ syncedAt: '2026-01-01T00:00:00.000Z', moviesSynced: 1, tvShowsSynced: 0 });
    seedLog({ syncedAt: '2026-02-01T00:00:00.000Z', moviesSynced: 2, tvShowsSynced: 1 });

    const { data } = await makeClient(app()).plex.getSyncLogs();
    expect(data).toHaveLength(2);
    expect(data[0]?.syncedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(data[0]?.moviesSynced).toBe(2);
  });

  it('GET /plex/scheduler/sync-logs honours the limit query param', async () => {
    seedLog({ syncedAt: '2026-01-01T00:00:00.000Z' });
    seedLog({ syncedAt: '2026-02-01T00:00:00.000Z' });
    seedLog({ syncedAt: '2026-03-01T00:00:00.000Z' });

    const { data } = await makeClient(app()).plex.getSyncLogs({ limit: 2 });
    expect(data).toHaveLength(2);
    expect(data[0]?.syncedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('GET /plex/scheduler/status reports stopped by default', async () => {
    const { data } = await makeClient(app()).plex.getSchedulerStatus();
    expect(data.isRunning).toBe(false);
    expect(data.nextSyncAt).toBeNull();
  });
});
