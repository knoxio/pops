import { beforeEach, describe, expect, it } from 'vitest';

import { DiscoveryCache } from '../cache.js';
import { discoveredPillar, FakeRegistryTransport } from './fixtures.js';

describe('DiscoveryCache', () => {
  let transport: FakeRegistryTransport;

  beforeEach(() => {
    transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ pillarId: 'finance' })],
    });
  });

  it('returns the pillar on first lookup and counts a miss', async () => {
    const cache = new DiscoveryCache({ transport, ttlMs: 60_000 });
    const result = await cache.lookup('finance');
    expect(result?.pillarId).toBe('finance');
    expect(transport.callCount).toBe(1);
    expect(cache.missCount).toBe(1);
    expect(cache.hitCount).toBe(0);
  });

  it('serves from cache while still within TTL', async () => {
    const clock = { time: 0 };
    const cache = new DiscoveryCache({
      transport,
      ttlMs: 60_000,
      now: () => clock.time,
    });
    await cache.lookup('finance');
    clock.time = 30_000;
    await cache.lookup('finance');
    await cache.lookup('finance');
    expect(transport.callCount).toBe(1);
    expect(cache.hitCount).toBe(2);
  });

  it('refetches once TTL elapses', async () => {
    const clock = { time: 0 };
    const cache = new DiscoveryCache({
      transport,
      ttlMs: 1_000,
      now: () => clock.time,
    });
    await cache.lookup('finance');
    clock.time = 1_500;
    await cache.lookup('finance');
    expect(transport.callCount).toBe(2);
    expect(cache.refreshCount).toBe(2);
  });

  it('returns undefined when the pillar is not in the snapshot', async () => {
    const cache = new DiscoveryCache({ transport, ttlMs: 60_000 });
    const result = await cache.lookup('media');
    expect(result).toBeUndefined();
  });

  it('dedupes concurrent fetches into one transport call', async () => {
    transport = new FakeRegistryTransport({
      pillars: [discoveredPillar()],
      delayMs: 25,
    });
    const cache = new DiscoveryCache({ transport, ttlMs: 60_000 });
    const [a, b, c] = await Promise.all([
      cache.lookup('finance'),
      cache.lookup('finance'),
      cache.lookup('finance'),
    ]);
    expect(a?.pillarId).toBe('finance');
    expect(b?.pillarId).toBe('finance');
    expect(c?.pillarId).toBe('finance');
    expect(transport.callCount).toBe(1);
  });

  it('invalidate() forces a refetch on the next lookup', async () => {
    const cache = new DiscoveryCache({ transport, ttlMs: 60_000 });
    await cache.lookup('finance');
    cache.invalidate();
    await cache.lookup('finance');
    expect(transport.callCount).toBe(2);
  });

  it('a failed fetch propagates and does not poison the cache', async () => {
    transport = new FakeRegistryTransport({
      failNext: 1,
      failError: new Error('boom'),
    });
    const cache = new DiscoveryCache({ transport, ttlMs: 60_000 });
    await expect(cache.lookup('finance')).rejects.toThrow('boom');
    transport.setPillars([discoveredPillar()]);
    const result = await cache.lookup('finance');
    expect(result?.pillarId).toBe('finance');
    expect(transport.callCount).toBe(2);
  });
});
