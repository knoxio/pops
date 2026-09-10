/**
 * The install set still applies offline (POPS-3239).
 *
 * An operator's `POPS_APPS` selection has to survive a registry outage. The
 * static floor that used to enforce it offline is gone (POPS-3227), so the
 * cached snapshot is the whole of the offline floor and has to be narrowed
 * the same way — otherwise the shell's offline behaviour depends on whether
 * this browser happens to hold a cache, and a module the operator excluded
 * comes back on a returning machine but not a fresh one.
 *
 * The install set is computed once at module load from the environment, so
 * these swap `isInstalledModule` rather than trying to move `POPS_APPS`
 * underneath it: `media` is the known-but-excluded module, everything else
 * this build ships stays installed.
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchBootRegistry } from './boot-snapshot';
import { offlineInstallableSnapshot } from './installed-modules';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

vi.mock('@pops/module-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pops/module-registry')>();
  return { ...actual, isInstalledModule: (id: string) => id !== 'media' };
});

/**
 * A pillar carrying the UI surface the loader needs.
 *
 * Every pillar advertises `nav` / `pages` / `assetsBaseUrl` since POPS-3215.
 * Before it, a payload with none of them still reached the rail through the
 * static bundle map; POPS-3227 removed that map outright, so a fixture
 * without a UI surface resolves to nothing and these tests would pass
 * vacuously.
 */
function manifestPayload(pillar: string): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    assetsBaseUrl: `/${pillar}-ui/${pillar}.js`,
    nav: {
      id: pillar,
      label: pillar,
      labelKey: pillar,
      icon: 'compass',
      basePath: `/${pillar}`,
      order: 10,
      items: [{ path: '', label: pillar, labelKey: `${pillar}.home`, icon: 'compass' }],
    },
    pages: [{ path: '', index: true, bundleSlot: `${pillar}-home` }],
  };
}

function snapshotEntry(pillarId: string): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    registered: true,
    lastSeenAt: new Date(0),
    manifest: manifestPayload(pillarId),
  };
}

describe('offlineInstallableSnapshot', () => {
  it('drops a module this build knows and the install set excludes', () => {
    const kept = offlineInstallableSnapshot([snapshotEntry('media'), snapshotEntry('lists')]);
    expect(kept.map((e) => e.pillarId)).toEqual(['lists']);
  });

  /**
   * The case that rules out filtering on `isInstalledModule` alone: it
   * answers false for every id outside the build-time `KNOWN_MODULES`
   * superset, which is every genuinely external pillar the runtime loader
   * exists to mount. An id this build has never heard of was never in an
   * operator's install set to exclude.
   */
  it('keeps a pillar the build has never heard of', () => {
    const kept = offlineInstallableSnapshot([snapshotEntry('weather')]);
    expect(kept.map((e) => e.pillarId)).toEqual(['weather']);
  });

  it('returns an empty snapshot unchanged', () => {
    expect(offlineInstallableSnapshot([])).toEqual([]);
  });
});

describe('fetchBootRegistry — the cached floor honours the install set', () => {
  function memoryStore() {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_k: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
      read: () => value,
    };
  }

  function okFetch(pillarIds: readonly string[]) {
    return vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            pillars: pillarIds.map((pillarId) => ({
              pillarId,
              baseUrl: `http://${pillarId}-api:3000`,
              manifest: manifestPayload(pillarId),
              lastHeartbeatAt: new Date(0).toISOString(),
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
  }

  const deadFetch = () => vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));

  /**
   * The live registry is the source of truth while it answers, so media
   * mounts and is cached. The outage is what hands authority back to the
   * install set — and the cache must not hand it away again.
   */
  it('drops an excluded module from the cache while keeping the rest', async () => {
    const store = memoryStore();
    const live = await fetchBootRegistry({ fetch: okFetch(['media', 'lists']), store });
    expect(live.source).toBe('registry');
    expect(live.manifests.map((m) => m.id)).toContain('media');

    const offline = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(offline.source).toBe('cached-snapshot');
    expect(offline.manifests.map((m) => m.id)).toEqual(['lists']);
  });

  /**
   * A cache narrowed away to nothing is not a broken cache — the operator may
   * widen `POPS_APPS` again — so it must survive rather than being cleared as
   * an unresolvable one.
   */
  it('keeps a cache the install set narrows to nothing', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });
    const cached = store.read();
    expect(cached).toContain('media');

    const offline = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(offline.manifests.map((m) => m.id)).not.toContain('media');
    expect(store.read()).toBe(cached);
  });
});
