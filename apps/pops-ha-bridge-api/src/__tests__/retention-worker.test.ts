import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HaBridgeDb } from '@pops/ha-bridge-db';

const pruneHistoryMock = vi.fn<(db: HaBridgeDb, cutoffMs: number) => number>();

vi.mock('@pops/ha-bridge-db', () => ({
  pruneHistory: (db: HaBridgeDb, cutoffMs: number) => pruneHistoryMock(db, cutoffMs),
}));

const { startRetentionWorker } = await import('../retention-worker.js');
const { HA_BRIDGE_DEFAULT_RETENTION_DAYS } = await import('../settings/manifest.js');

const fakeDb = { __tag: 'fake-db' } as unknown as HaBridgeDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  pruneHistoryMock.mockReset();
  pruneHistoryMock.mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startRetentionWorker (PRD-229 US-01)', () => {
  it('runs pruneHistory immediately on start with the configured cutoff', () => {
    const handle = startRetentionWorker({ db: fakeDb, retentionDays: 30 });

    expect(pruneHistoryMock).toHaveBeenCalledTimes(1);
    const expectedCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(pruneHistoryMock).toHaveBeenLastCalledWith(fakeDb, expectedCutoff);

    handle.stop();
  });

  it('reschedules at intervalMs', () => {
    const intervalMs = 60_000;
    const handle = startRetentionWorker({ db: fakeDb, intervalMs, retentionDays: 7 });

    expect(pruneHistoryMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(intervalMs);
    expect(pruneHistoryMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(intervalMs * 2);
    expect(pruneHistoryMock).toHaveBeenCalledTimes(4);

    handle.stop();
  });

  it('survives a failing prune and reschedules the next run', () => {
    pruneHistoryMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    pruneHistoryMock.mockReturnValueOnce(5);

    const warn = vi.fn();
    const intervalMs = 1_000;
    const handle = startRetentionWorker({
      db: fakeDb,
      intervalMs,
      retentionDays: 30,
      logger: { warn },
    });

    expect(pruneHistoryMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'ha-bridge retention prune failed',
      expect.objectContaining({ error: 'boom' })
    );

    vi.advanceTimersByTime(intervalMs);
    expect(pruneHistoryMock).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('stop() prevents future runs', () => {
    const intervalMs = 1_000;
    const handle = startRetentionWorker({ db: fakeDb, intervalMs, retentionDays: 30 });

    expect(pruneHistoryMock).toHaveBeenCalledTimes(1);

    handle.stop();
    vi.advanceTimersByTime(intervalMs * 10);

    expect(pruneHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the manifest default retention when no option is provided', () => {
    const handle = startRetentionWorker({ db: fakeDb });

    const expectedCutoff = Date.now() - HA_BRIDGE_DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect(pruneHistoryMock).toHaveBeenLastCalledWith(fakeDb, expectedCutoff);

    handle.stop();
  });

  it('is a no-op when no expired rows exist (pruneHistory returns 0)', () => {
    pruneHistoryMock.mockReturnValueOnce(0);
    const info = vi.fn();

    const handle = startRetentionWorker({ db: fakeDb, retentionDays: 30, logger: { info } });

    expect(info).toHaveBeenCalledWith(
      'ha-bridge retention prune complete',
      expect.objectContaining({ deleted: 0, retentionDays: 30 })
    );

    handle.stop();
  });

  it('logs deleted count via info logger after a successful prune', () => {
    pruneHistoryMock.mockReturnValueOnce(42);
    const info = vi.fn();

    const handle = startRetentionWorker({
      db: fakeDb,
      retentionDays: 14,
      logger: { info },
    });

    expect(info).toHaveBeenCalledWith(
      'ha-bridge retention prune complete',
      expect.objectContaining({ deleted: 42, retentionDays: 14 })
    );

    handle.stop();
  });
});
