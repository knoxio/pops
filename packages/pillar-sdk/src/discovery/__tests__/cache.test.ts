import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lookupPillar, pillarRegistry } from '../api.js';
import {
  configureCache,
  disposeDiscoveryClient,
  invalidateRegistryCache,
  type RegistryFetcher,
} from '../cache.js';
import { RegistryUnreachableError } from '../types.js';
import { fetchResult, pillar } from './fixtures.js';

type ScheduledEntry = { cb: () => void; runAt: number; cancelled: boolean };

type FakeClock = {
  now: () => number;
  advance(ms: number): void;
  scheduled: ScheduledEntry[];
  set(cb: () => void, ms: number): ScheduledEntry;
  clear(handle: unknown): void;
};

function fakeClock(start = 1_700_000_000_000): FakeClock {
  let current = start;
  const scheduled: FakeClock['scheduled'] = [];

  function set(cb: () => void, ms: number): ScheduledEntry {
    const entry: ScheduledEntry = { cb, runAt: current + ms, cancelled: false };
    scheduled.push(entry);
    return entry;
  }

  function clear(handle: unknown): void {
    if (handle === null || handle === undefined) return;
    if (typeof handle === 'object' && 'cancelled' in handle) {
      (handle as ScheduledEntry).cancelled = true;
    }
  }

  function advance(ms: number): void {
    const target = current + ms;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const entry of scheduled) {
        if (entry.cancelled) continue;
        if (entry.runAt > target) continue;
        entry.cancelled = true;
        current = entry.runAt;
        entry.cb();
        progressed = true;
      }
    }
    current = target;
  }

  return {
    now: () => current,
    advance,
    scheduled,
    set,
    clear,
  };
}

describe('discovery cache singleton', () => {
  let clock: FakeClock;
  let warnings: Array<{ message: string; context: Record<string, unknown> }>;

  beforeEach(() => {
    clock = fakeClock();
    warnings = [];
    configureCache({
      registryUrl: 'http://registry-api:3001',
      ttlMs: 30_000,
      now: clock.now,
      setTimeoutImpl: clock.set,
      clearTimeoutImpl: clock.clear,
      onWarn: (message, context) => warnings.push({ message, context }),
    });
  });

  afterEach(() => {
    disposeDiscoveryClient();
  });

  function withFetcher(fetcher: RegistryFetcher): void {
    configureCache({
      registryUrl: 'http://registry-api:3001',
      ttlMs: 30_000,
      now: clock.now,
      setTimeoutImpl: clock.set,
      clearTimeoutImpl: clock.clear,
      onWarn: (message, context) => warnings.push({ message, context }),
      fetcher,
    });
  }

  it('throws RegistryUnreachableError when the first fetch fails with an empty cache', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('econnrefused'));
    withFetcher(fetcher);

    await expect(lookupPillar('finance')).rejects.toBeInstanceOf(RegistryUnreachableError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the pillar is missing from a fresh snapshot', async () => {
    withFetcher(async () => fetchResult(pillar('finance', 'http://finance-api:3004')));
    const result = await lookupPillar('media');
    expect(result).toBeUndefined();
  });

  it('serves a cached snapshot on the second call within TTL', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(fetchResult(pillar('finance', 'http://finance-api:3004')));
    withFetcher(fetcher);

    const first = await pillarRegistry();
    expect(first.source).toBe('fresh');

    clock.advance(1_000);

    const second = await pillarRegistry();
    expect(second.source).toBe('cached');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refreshes the cache when TTL has expired (background refresh transparently updates baseUrl)', async () => {
    let callCount = 0;
    withFetcher(async () => {
      callCount += 1;
      return fetchResult(pillar('finance', `http://finance-api:300${callCount}`));
    });

    const first = await pillarRegistry();
    expect(first.pillars[0]!.baseUrl).toBe('http://finance-api:3001');
    expect(first.source).toBe('fresh');

    clock.advance(40_000);

    const second = await pillarRegistry();
    expect(second.pillars[0]!.baseUrl).toBe('http://finance-api:3002');
    expect(callCount).toBe(2);
  });

  it('dedupes concurrent fetches: two awaits share one HTTP call', async () => {
    let resolve!: (value: ReturnType<typeof fetchResult>) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res;
        })
    );
    withFetcher(fetcher);

    const a = lookupPillar('finance');
    const b = lookupPillar('media');
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve(
      fetchResult(pillar('finance', 'http://finance-api:3004'), pillar('media', 'http://media:3'))
    );

    const [aResult, bResult] = await Promise.all([a, b]);
    expect(aResult?.pillarId).toBe('finance');
    expect(bResult?.pillarId).toBe('media');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves stale-fallback when a background refresh fails after a successful fetch', async () => {
    let calls = 0;
    withFetcher(async () => {
      calls += 1;
      if (calls === 1) {
        return fetchResult(pillar('finance', 'http://finance-api:3004'));
      }
      throw new Error('connection reset');
    });

    const first = await pillarRegistry();
    expect(first.source).toBe('fresh');

    clock.advance(40_000);

    const second = await pillarRegistry();
    expect(second.source).toBe('stale-fallback');
    expect(second.pillars[0]!.pillarId).toBe('finance');
    expect(warnings.some((w) => w.message.includes('stale cache'))).toBe(true);
    expect(warnings[0]!.context['consecutiveFailures']).toBeGreaterThanOrEqual(1);
  });

  it('background timer fires automatically before TTL expiry', async () => {
    let calls = 0;
    withFetcher(async () => {
      calls += 1;
      return fetchResult(pillar('finance', `http://finance-api:300${calls}`));
    });

    await pillarRegistry();
    expect(calls).toBe(1);

    clock.advance(29_500);
    await pillarRegistry();
    expect(calls).toBe(2);

    clock.advance(1_000);

    const next = await pillarRegistry();
    expect(next.source).toBe('cached');
    expect(next.pillars[0]!.baseUrl).toBe('http://finance-api:3002');
  });

  it('invalidateRegistryCache() forces a refetch on the next call', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(fetchResult(pillar('finance', 'http://finance-api:3004')));
    withFetcher(fetcher);

    await pillarRegistry();
    expect(fetcher).toHaveBeenCalledTimes(1);

    invalidateRegistryCache();

    const result = await pillarRegistry();
    expect(result.source).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('disposeDiscoveryClient() cancels the background timer', async () => {
    let calls = 0;
    withFetcher(async () => {
      calls += 1;
      return fetchResult(pillar('finance', 'http://finance-api:3004'));
    });

    await pillarRegistry();
    expect(calls).toBe(1);

    disposeDiscoveryClient();

    clock.advance(60_000);
    expect(calls).toBe(1);
  });
});
