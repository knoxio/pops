/**
 * Boot install-set resolver — resilience contract tests (P7-T03 / RD-3).
 *
 * The safety-critical guarantee under test: the shell mounts the live
 * registry snapshot's pillars when the registry is reachable, and NEVER
 * bricks when it is not — it falls back to the static in-repo bundle-map
 * floor. Both branches are exercised with injected fixtures (no live fetch).
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchBootRegistry, resolveBootRegistry } from './boot-snapshot';
import { WORKSPACE_BUNDLE_MAP } from './bundle-map';
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

const IN_REPO_IDS = Object.keys(WORKSPACE_BUNDLE_MAP);

describe('resolveBootRegistry — registry-driven (snapshot non-empty)', () => {
  it('derives the install set from the snapshot, not the full bundle map', () => {
    const result = resolveBootRegistry([snapshotEntry('finance'), snapshotEntry('media')]);
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['finance', 'media']);
    // The bundle map carries seven in-repo pillars; the snapshot narrowed the
    // install set to two, proving the registry is the source of truth.
    expect(result.manifests.length).toBeLessThan(IN_REPO_IDS.length);
  });

  it('drops a backend-only registered pillar with no UI surface', () => {
    const result = resolveBootRegistry([
      snapshotEntry('finance'),
      // `registry` is in the snapshot but absent from the bundle map and
      // advertises no assetsBaseUrl → walk drops it silently.
      snapshotEntry('registry'),
    ]);
    expect(result.manifests.map((m) => m.id)).toEqual(['finance']);
  });

  it('mounts an in-repo pillar AND an external pillar from one snapshot', () => {
    const result = resolveBootRegistry(
      [snapshotEntry('finance'), externalSnapshotEntry()],
      inertImporter
    );
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id).toSorted()).toEqual(['finance', 'weather']);

    const railIds = result.registeredApps.map((a) => a.id);
    expect(railIds).toContain('finance');
    expect(railIds).toContain('weather');
    // Wire nav.order (finance=10 in-repo, weather=35) keeps the rail ordered.
    expect(railIds.indexOf('finance')).toBeLessThan(railIds.indexOf('weather'));
  });

  it('mounts an external pillar advertised only via assetsBaseUrl through the runtime loader', () => {
    const result = resolveBootRegistry([externalSnapshotEntry()], inertImporter);
    const weather = result.manifests.find((m) => m.id === 'weather');
    expect(weather).toBeDefined();
    expect(weather?.surfaces).toContain('app');
    expect(Array.isArray(weather?.frontend?.routes)).toBe(true);
    expect(result.registeredApps.map((a) => a.id)).toContain('weather');
  });
});

describe('resolveBootRegistry — never-brick fallback (snapshot empty)', () => {
  it('renders the FULL in-repo app set from the static floor when the snapshot is empty', () => {
    const result = resolveBootRegistry([]);
    expect(result.source).toBe('static-floor');

    // The never-brick guarantee: every in-repo app-routed pillar still mounts.
    // Assert the router-facing app set (the exact `filterAppManifests`
    // predicate the router uses) is non-empty AND matches the bundle-map
    // floor's app-routed pillars exactly — a blank shell would surface as [].
    expect(result.manifests.length).toBeGreaterThan(0);
    const floorAppIds = IN_REPO_IDS.filter((id) => {
      const m = WORKSPACE_BUNDLE_MAP[id]?.manifest;
      return m?.surfaces.includes('app') === true && Array.isArray(m.frontend?.routes);
    }).toSorted();
    const mountedAppIds = filterAppManifests(result.manifests)
      .map((m) => m.id)
      .toSorted();
    expect(mountedAppIds).toEqual(floorAppIds);
    expect(mountedAppIds.length).toBeGreaterThan(0);
  });

  it('renders the full in-repo app rail (not blank) on the fallback path', () => {
    const result = resolveBootRegistry([]);
    expect(result.registeredApps.length).toBeGreaterThan(0);
    expect(result.registeredApps.map((a) => a.id)).toEqual([
      'finance',
      'media',
      'inventory',
      'food',
      'lists',
      'cerebrum',
      'ai',
    ]);
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
              pillarId: 'finance',
              baseUrl: 'http://finance-api:3001',
              manifest: manifestPayload('finance'),
              lastHeartbeatAt: new Date(0).toISOString(),
            },
          ],
        })
      )
    );
    const result = await fetchBootRegistry({ fetch: fetchStub });
    expect(result.source).toBe('registry');
    expect(result.manifests.map((m) => m.id)).toEqual(['finance']);
  });

  it('falls back to the static floor when the fetch rejects (registry unreachable)', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await fetchBootRegistry({ fetch: fetchStub });
    expect(result.source).toBe('static-floor');
    expect(result.manifests.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor on a non-OK status', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({}, 502)));
    const result = await fetchBootRegistry({ fetch: fetchStub });
    expect(result.source).toBe('static-floor');
    expect(result.registeredApps.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor on an empty pillar list', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({ pillars: [] })));
    const result = await fetchBootRegistry({ fetch: fetchStub });
    expect(result.source).toBe('static-floor');
    expect(result.registeredApps.length).toBeGreaterThan(0);
  });

  it('falls back to the static floor when the fetch times out', async () => {
    const fetchStub = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const result = await fetchBootRegistry({ fetch: fetchStub, timeoutMs: 1 });
    expect(result.source).toBe('static-floor');
    expect(result.manifests.length).toBeGreaterThan(0);
  });
});
