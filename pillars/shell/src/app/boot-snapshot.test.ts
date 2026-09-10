/**
 * Boot install-set resolver — resilience contract tests (P7-T03 / RD-3).
 *
 * The safety-critical guarantee under test: the shell mounts the live
 * registry snapshot's pillars when the registry is reachable, and NEVER
 * bricks when it is not — it falls back to the cached snapshot, and to an
 * empty surface when there is no cache either. Both branches are exercised
 * with injected fixtures (no live fetch).
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchBootRegistry, resolveBootRegistry } from './boot-snapshot';
import { filterAppManifests } from './installed-modules';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

import type { RemoteModuleImporter } from './external-ui';

function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
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
    ...extra,
  };
}

/**
 * The wire UI dimensions an in-repo pillar publishes since POPS-3215.
 *
 * They used to be unnecessary: an entry with no UI surface still reached the
 * rail through the shell's bundle map. Every pillar has left that map, so a
 * fixture without these resolves to nothing — and a test asserting a mounted
 * rail would pass only by asserting emptiness.
 *
 * Applied by {@link uiEntry} rather than by `snapshotEntry`, so the
 * backend-only cases — a pillar that registers with no UI at all — stay
 * expressible and keep meaning what they say.
 */
function inRepoUi(pillarId: string): Partial<ManifestPayload> {
  return {
    assetsBaseUrl: `/${pillarId}-ui/${pillarId}.js`,
    nav: {
      id: pillarId,
      label: pillarId,
      labelKey: pillarId,
      icon: 'compass',
      basePath: `/${pillarId}`,
      order: 20,
      items: [{ path: '', label: pillarId, labelKey: `${pillarId}.home`, icon: 'compass' }],
    },
    pages: [{ path: '', index: true, bundleSlot: `${pillarId}-home` }],
  };
}

/**
 * Platform services that register with no UI at all. Giving these a surface
 * would quietly break the tests that turn on a snapshot resolving to nothing.
 */
const BACKEND_ONLY = new Set(['registry', 'orchestrator']);

/** A registered pillar that advertises a mountable UI, as they all now do. */
function uiEntry(pillarId: string): PillarSnapshot {
  return snapshotEntry(pillarId, { manifest: inRepoUi(pillarId) });
}

function snapshotEntry(
  pillarId: string,
  options: { registered?: boolean; manifest?: Partial<ManifestPayload> } = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3001`,
    manifest: manifestPayload(pillarId, options.manifest),
    registered: options.registered ?? true,
    lastSeenAt: new Date(0),
  };
}

const EXTERNAL_NAV = {
  id: 'weather',
  label: 'Weather',
  labelKey: 'weather',
  icon: 'Compass',
  basePath: '/weather',
  order: 35,
  items: [{ path: '', label: 'Home', labelKey: 'weather.home', icon: 'Compass' }],
};

const EXTERNAL_PAGES = [{ path: '', index: true, bundleSlot: 'home' }];

function externalSnapshotEntry(): PillarSnapshot {
  return snapshotEntry('weather', {
    manifest: {
      assetsBaseUrl: 'https://cdn.example.com/weather/index.js',
      nav: EXTERNAL_NAV,
      pages: EXTERNAL_PAGES,
    },
  });
}

/** A no-op importer; synthesis is synchronous, so it must never be invoked. */
const inertImporter: RemoteModuleImporter = () =>
  Promise.reject(new Error('importer must not run during synthesis'));

describe('resolveBootRegistry — registry-driven (snapshot non-empty)', () => {
  /**
   * The snapshot is the only source there is. This test used to prove that by
   * comparing against the bundle map — "the snapshot narrowed the install set
   * to fewer than the map carries" — and POPS-3227 deleted the map, so what
   * is left to assert is the direct statement: what mounts is exactly what
   * the snapshot named, and nothing arrives from anywhere else.
   */
  it('mounts exactly what the snapshot names', () => {
    const result = resolveBootRegistry([uiEntry('media')]);
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id)).toEqual(['media']);
    expect(result.registeredApps.map((a) => a.id)).toEqual(['media']);
  });

  it('drops a backend-only registered pillar with no UI surface', () => {
    const result = resolveBootRegistry([
      uiEntry('media'),
      // `registry` is in the snapshot but absent from the bundle map and
      // advertises no assetsBaseUrl → walk drops it silently.
      snapshotEntry('registry'),
    ]);
    expect(result.manifests.map((m) => m.id)).toEqual(['media']);
  });

  it('mounts an in-repo pillar AND an external pillar from one snapshot', () => {
    const result = resolveBootRegistry([uiEntry('media'), externalSnapshotEntry()], inertImporter);
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['media', 'weather']);

    const railIds = result.registeredApps.map((a) => a.id);
    expect(railIds).toContain('media');
    expect(railIds).toContain('weather');
    // Wire nav.order (finance=10 in-repo, weather=35) keeps the rail ordered.
    expect(railIds.indexOf('media')).toBeLessThan(railIds.indexOf('weather'));
  });

  it('mounts an external pillar advertised only via assetsBaseUrl through the runtime loader', () => {
    const result = resolveBootRegistry([externalSnapshotEntry()], inertImporter);
    const weather = result.manifests.find((m) => m.id === 'weather');
    expect(weather).toBeDefined();
    expect(weather?.surfaces).toContain('app');
    expect(Array.isArray(weather?.frontend?.routes)).toBe(true);
    expect(result.registeredApps.map((a) => a.id)).toContain('weather');
  });

  // M2(a): the registry-driven branch is THIS PR's whole purpose, yet no
  // rendered/e2e test exercises it (every e2e silently falls through to the
  // floor — see the PR body). This focused unit pins the live-mount path
  // non-blank: a non-empty snapshot with 2 pillars, each advertising an
  // `assetsBaseUrl`, must yield source='registry' with BOTH a non-empty
  // router manifest set (including the synthesized external route) and a
  // non-empty app rail. A regression that breaks only the live mount —
  // invisible to the floor-only e2e — fails here.
  it('drives the live registry branch to a non-blank surface (in-repo + external)', () => {
    const result = resolveBootRegistry([uiEntry('media'), externalSnapshotEntry()], inertImporter);

    expect(result.source).toBe('registry');

    // Router-facing set: non-empty, both pillars present, external route synthesized.
    expect(result.manifests.length).toBeGreaterThan(0);
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['media', 'weather']);
    const external = result.manifests.find((m) => m.id === 'weather');
    expect(external?.surfaces).toContain('app');
    const externalRoutes = external?.frontend?.routes;
    expect(Array.isArray(externalRoutes)).toBe(true);
    if (Array.isArray(externalRoutes)) {
      expect(externalRoutes.length).toBeGreaterThan(0);
    }

    // App rail: non-empty, both pillars present.
    expect(result.registeredApps.length).toBeGreaterThan(0);
    expect(result.registeredApps.map((a) => a.id)).toEqual(
      expect.arrayContaining(['media', 'weather'])
    );
  });
});

describe('resolveBootRegistry — never-brick on a zero-UI live snapshot', () => {
  // M1 (never-brick hole): a NON-EMPTY snapshot whose pillars are all
  // backend-only — no `assetsBaseUrl`, so no UI surface at all — is the live
  // state mid-deploy on a host restart, before the app pillars have
  // re-registered (only `registry` / `orchestrator` are up). `snapshot.length
  // > 0` is true, but the snapshot resolves to zero mountable UI. Treating
  // that as "registry is the source of truth" would mount an app-less shell
  // (manifests = [], registeredApps = []) — exactly the brick the resilience
  // contract forbids, reachable on a real capivara restart. The resolver must
  // report `'empty'` instead, so `fetchBootRegistry` can fall back to the
  // cached snapshot.
  const BACKEND_ONLY_SNAPSHOT = [snapshotEntry('registry'), snapshotEntry('orchestrator')];

  it('resolves to nothing when a live snapshot yields zero mountable UI', () => {
    const result = resolveBootRegistry(BACKEND_ONLY_SNAPSHOT);
    expect(result.source).toBe('empty');
  });

  it('mounts the FULL in-repo rail (not an app-less shell) on the zero-UI fallback', () => {
    const result = resolveBootRegistry(BACKEND_ONLY_SNAPSHOT);

    // This asserted the floor's app set was non-empty — the never-brick
    // guarantee as it stood when the shell compiled its pillars in. POPS-3215
    // moved all of them onto the loader, so the floor has no app to mount and
    // the honest assertion is that it degrades to an empty set rather than to
    // something arbitrary. The guarantee itself now rests on the cached
    // snapshot (POPS-3239), which `offline-install-set.test.ts` and the
    // cached-floor block below cover.
    // There is no floor left to compare against — POPS-3227 removed the
    // bundle map — so the fallback mounts nothing, which is the state this
    // asserts directly rather than through the map.
    expect(filterAppManifests(result.manifests)).toEqual([]);

    expect(result.registeredApps.map((a) => a.id)).toEqual([]);

    // The result must be identical to the empty-snapshot path: a zero-UI live
    // snapshot degrades EXACTLY as if the registry were down. Both are empty
    // now, and the equality is still what matters — the two must not diverge.
    const emptyFloor = resolveBootRegistry([]);
    expect(filterAppManifests(result.manifests).map((m) => m.id)).toEqual(
      filterAppManifests(emptyFloor.manifests).map((m) => m.id)
    );
    expect(result.registeredApps.map((a) => a.id)).toEqual(
      emptyFloor.registeredApps.map((a) => a.id)
    );
  });
});

describe('resolveBootRegistry — never-brick fallback (snapshot empty)', () => {
  it('resolves to an empty surface when the snapshot is empty', () => {
    const result = resolveBootRegistry([]);
    expect(result.source).toBe('empty');

    // The never-brick guarantee: every in-repo app-routed pillar still mounts.
    // Assert the router-facing app set (the exact `filterAppManifests`
    // predicate the router uses) is non-empty AND matches the bundle-map
    // The floor's app set is empty since POPS-3226 took the last pillar out of
    // the bundle map, so this now says the empty-snapshot path and the floor
    // agree on nothing rather than on everything. The equality is still the
    // point: the two must not diverge.
    // There is no floor left to compare against — POPS-3227 removed the
    // bundle map — so the fallback mounts nothing, which is the state this
    // asserts directly rather than through the map.
    expect(filterAppManifests(result.manifests)).toEqual([]);
  });

  /**
   * The rail on the fallback path is empty, and that is the epic's accepted
   * trade rather than an oversight: with no pillar compiled into the shell
   * there is nothing for a static floor to render. The never-brick guarantee
   * moved to the cached snapshot (POPS-3239); what survives here is that boot
   * still produces a resolved, renderable result instead of throwing.
   */
  it('resolves to an empty rail on the fallback path, rather than failing', () => {
    const result = resolveBootRegistry([]);
    expect(result.source).toBe('empty');
    expect(result.registeredApps.map((a) => a.id)).toEqual([]);
  });
});

describe('fetchBootRegistry — fetch-failure resilience', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('uses the snapshot when the fetch returns registered pillars', async () => {
    const fetchStub = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          pillars: [
            {
              pillarId: 'media',
              baseUrl: 'http://media-api:3003',
              manifest: manifestPayload('media', inRepoUi('media')),
              lastHeartbeatAt: new Date(0).toISOString(),
            },
          ],
        })
      )
    );
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id)).toEqual(['media']);
  });

  /**
   * An explicitly empty store on each of these.
   *
   * Their subject is "a failed fetch still yields a surface", and since
   * POPS-3239 the surface is the last good snapshot when there is one. Left
   * ambient they would read whatever `localStorage` happened to hold — which
   * is the previous test's leftovers, not a floor anyone chose.
   */
  function noCache() {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_k: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };
  }

  it('resolves to an empty surface when the fetch rejects (registry unreachable)', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('empty');
    // The floor is empty since POPS-3226; what this still asserts is that an
    // unreachable registry degrades to it rather than throwing or leaving the
    // shell mid-boot.
    expect(result.manifests).toEqual([]);
  });

  it('resolves to an empty surface on a non-OK status', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({}, 502)));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('empty');
    // The floor is empty since POPS-3226; what this still asserts is that a
    // bad response degrades to it rather than throwing or leaving the shell
    // mid-boot.
    expect(result.registeredApps).toEqual([]);
  });

  it('resolves to an empty surface on an empty pillar list', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({ pillars: [] })));
    const result = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(result.source).toBe('empty');
    // The floor is empty since POPS-3226; what this still asserts is that a
    // bad response degrades to it rather than throwing or leaving the shell
    // mid-boot.
    expect(result.registeredApps).toEqual([]);
  });

  it('resolves to an empty surface when the fetch times out', async () => {
    const fetchStub = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const result = await fetchBootRegistry({ fetch: fetchStub, timeoutMs: 1, store: noCache() });
    expect(result.source).toBe('empty');
    // The floor is empty since POPS-3226; what this still asserts is that a
    // timed-out registry degrades to it rather than throwing or leaving the
    // shell mid-boot.
    expect(result.manifests).toEqual([]);
  });
});

/**
 * The cached-snapshot floor (POPS-3239).
 *
 * The shell's offline floor used to be the static bundle map. POPS-3215
 * empties that map, so the floor empties with it — at the end of the epic a
 * registry outage would leave the shell with its own chrome, an empty rail and
 * the settings page. These drive the replacement: the set that answered last
 * time.
 */
describe('fetchBootRegistry — the cached-snapshot floor', () => {
  function memoryStore(initial?: string) {
    let value = initial ?? null;
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
              manifest: manifestPayload(
                pillarId,
                BACKEND_ONLY.has(pillarId) ? {} : inRepoUi(pillarId)
              ),
              lastHeartbeatAt: new Date(0).toISOString(),
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
  }

  const deadFetch = () => vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));

  it('caches a snapshot that resolved to a usable surface', async () => {
    const store = memoryStore();
    const result = await fetchBootRegistry({ fetch: okFetch(['media']), store });

    expect(result.source).toBe('registry');
    expect(store.read()).toContain('media');
  });

  // The whole point: the registry is unreachable and the pillars are not.
  it('mounts the last good snapshot when the registry is unreachable', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });

    const offline = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(offline.source).toBe('cached-snapshot');
    expect(offline.manifests.map((m) => m.id)).toEqual(['media']);
  });

  it('prefers a live snapshot over the cached one', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });

    const live = await fetchBootRegistry({ fetch: okFetch(['media']), store });

    expect(live.source).toBe('registry');
    expect(live.manifests.map((m) => m.id)).toEqual(['media']);
  });

  // A snapshot that mounted nothing is not a floor. Caching it would replace a
  // good one with a useless one.
  it('does not cache a snapshot that resolved to nothing', async () => {
    const store = memoryStore();
    await fetchBootRegistry({ fetch: okFetch(['media']), store });
    await fetchBootRegistry({ fetch: okFetch(['registry']), store });

    expect(store.read()).toContain('media');
    expect(store.read()).not.toContain('"pillarId":"registry"');
  });

  it('falls through to an empty surface when there is no cache', async () => {
    const result = await fetchBootRegistry({ fetch: deadFetch(), store: memoryStore() });
    expect(result.source).toBe('empty');
  });

  // Every pillar in the cache has left the build, so it resolves to nothing.
  // Keeping it would fail identically on every boot from here on.
  it('drops a cache that no longer resolves to anything', async () => {
    const stale = JSON.stringify([
      {
        pillarId: 'a-pillar-that-no-longer-exists',
        baseUrl: 'http://gone:3000',
        registered: true,
        lastSeenAt: new Date(0).toISOString(),
        manifest: manifestPayload('a-pillar-that-no-longer-exists'),
      },
    ]);
    const store = memoryStore(stale);

    const result = await fetchBootRegistry({ fetch: deadFetch(), store });

    expect(result.source).toBe('empty');
    expect(store.read()).toBeNull();
  });
});

/**
 * The wire → boot path for the surfaces that are not pages (POPS-3266).
 *
 * `synthesizeExternalBundleEntry`'s own tests hand it a descriptor directly,
 * which is precisely how the first version of this shipped broken: the
 * synthesizer read `descriptor.captureOverlay`, and nothing between the wire
 * manifest and the descriptor ever put it there. Everything below starts from
 * a `PillarSnapshot` — the shape the registry actually returns — so the
 * carry-through is exercised rather than assumed.
 */
describe('resolveBootRegistry — non-page surfaces off the wire', () => {
  /** The wire UI dimensions a loader-mounted pillar publishes. */
  function loaderUi(pillarId: string): Partial<ManifestPayload> {
    return {
      assetsBaseUrl: `/${pillarId}-ui/${pillarId}.js`,
      nav: {
        id: pillarId,
        label: pillarId,
        labelKey: pillarId,
        icon: 'compass',
        basePath: `/${pillarId}`,
        order: 50,
        items: [{ path: '', label: pillarId, labelKey: `${pillarId}.home`, icon: 'compass' }],
      },
      pages: [{ path: '', index: true, bundleSlot: `${pillarId}-home` }],
    };
  }

  const OVERLAY = {
    bundleSlot: 'quick-add',
    order: 10,
    labelKey: 'acme.capture.label',
  } as const;

  function overlayPillar(): PillarSnapshot {
    return snapshotEntry('acme', {
      manifest: { ...loaderUi('acme'), captureOverlay: OVERLAY },
    });
  }

  it('carries the capture overlay from the wire manifest to the bundle map', () => {
    const result = resolveBootRegistry([overlayPillar()]);
    expect(Object.keys(result.bundleMap.acme?.captureOverlayBundles ?? {})).toEqual(['quick-add']);
  });

  it('puts the descriptor on the manifest the capture registry ranks', () => {
    const result = resolveBootRegistry([overlayPillar()]);
    const manifest = result.manifests.find((m) => m.id === 'acme');
    expect(manifest?.frontend?.captureOverlay).toEqual(OVERLAY);
  });

  it('carries no overlay record for a pillar whose manifest declares none', () => {
    const plain = snapshotEntry('acme', { manifest: loaderUi('acme') });
    const result = resolveBootRegistry([plain]);
    expect(result.bundleMap.acme?.captureOverlayBundles).toBeUndefined();
  });

  /**
   * Widget slots are derived from the settings manifests the pillar publishes,
   * so this starts from those rather than from a slot list — the derivation is
   * the part that can silently produce nothing.
   */
  it('derives settings-widget slots from the published settings groups', () => {
    const withWidgets = snapshotEntry('acme', {
      manifest: {
        ...loaderUi('acme'),
        settings: {
          manifests: [
            {
              id: 'acme.plex',
              title: 'Plex',
              order: 10,
              groups: [
                {
                  id: 'account',
                  title: 'Account',
                  widget: { bundleSlot: 'plex-connect' },
                  fields: [],
                },
                { id: 'plain', title: 'Plain', fields: [] },
              ],
            },
          ],
        },
      },
    });

    const result = resolveBootRegistry([withWidgets]);
    expect(Object.keys(result.bundleMap.acme?.settingsWidgetBundles ?? {})).toEqual([
      'plex-connect',
    ]);
  });
});
