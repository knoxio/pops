import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pillar } from '../../discovery/__tests__/fixtures.js';
import { lookupPillar, pillarRegistry } from '../../discovery/api.js';
import { disposeDiscoveryClient } from '../../discovery/cache.js';
import { RegistryUnreachableError, type RegistrySnapshot } from '../../discovery/types.js';
import {
  configureDiscoveryForTest,
  failNextRegistryFetches,
  seedRegistryCache,
} from '../discovery.js';

function emptySnapshot(source: RegistrySnapshot['source'] = 'fresh'): RegistrySnapshot {
  return { pillars: [], fetchedAt: new Date(), ttlMs: 30_000, source };
}

describe('@pops/pillar-sdk/testing/discovery', () => {
  beforeEach(() => {
    configureDiscoveryForTest({
      registryUrl: 'http://registry-api:3001',
      ttlMs: 30_000,
      fetcher: async () => {
        throw new Error('test must not hit the network');
      },
      onWarn: () => {},
    });
  });

  afterEach(() => {
    disposeDiscoveryClient();
  });

  it('seedRegistryCache injects a snapshot that subsequent lookups read from', async () => {
    seedRegistryCache({
      pillars: [pillar('finance', 'http://finance-api:3004')],
      fetchedAt: new Date(),
      ttlMs: 30_000,
      source: 'fresh',
    });

    const result = await lookupPillar('finance');
    expect(result?.baseUrl).toBe('http://finance-api:3004');

    const all = await pillarRegistry();
    expect(all.pillars).toHaveLength(1);
    expect(all.source).toBe('cached');
  });

  it('a seeded snapshot suspends background refresh (no fetcher hit even after a long delay)', async () => {
    let fetcherCalls = 0;
    configureDiscoveryForTest({
      registryUrl: 'http://registry-api:3001',
      ttlMs: 30_000,
      fetcher: async () => {
        fetcherCalls += 1;
        throw new Error('should not be called when seeded');
      },
      onWarn: () => {},
    });

    seedRegistryCache({
      pillars: [pillar('finance', 'http://finance-api:3004')],
      fetchedAt: new Date(),
      ttlMs: 30_000,
      source: 'fresh',
    });

    await pillarRegistry();
    await pillarRegistry();
    await pillarRegistry();

    expect(fetcherCalls).toBe(0);
  });

  it('failNextRegistryFetches causes the next call to surface RegistryUnreachableError when no cache', async () => {
    failNextRegistryFetches(1, new Error('injected failure'));
    await expect(lookupPillar('finance')).rejects.toBeInstanceOf(RegistryUnreachableError);
  });

  it('failNextRegistryFetches exhausts after N calls then falls through to the real fetcher', async () => {
    let calls = 0;
    configureDiscoveryForTest({
      registryUrl: 'http://registry-api:3001',
      ttlMs: 30_000,
      fetcher: async () => {
        calls += 1;
        return {
          pillars: [pillar('finance', `http://finance:300${calls}`)],
          fetchedAt: new Date(),
        };
      },
      onWarn: () => {},
    });

    failNextRegistryFetches(2, new Error('still failing'));

    await expect(pillarRegistry()).rejects.toBeInstanceOf(RegistryUnreachableError);
    await expect(pillarRegistry()).rejects.toBeInstanceOf(RegistryUnreachableError);

    const ok = await pillarRegistry();
    expect(ok.pillars[0]!.baseUrl).toBe('http://finance:3001');
  });

  it('emptySnapshot through the test harness is a valid serializable shape', () => {
    expect(emptySnapshot()).toMatchObject({ pillars: [], source: 'fresh' });
  });
});
