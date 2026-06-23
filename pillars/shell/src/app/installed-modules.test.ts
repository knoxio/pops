/**
 * Shell-side install-set aggregator.
 *
 * P7-T03 / RD-3 moved the install-set source from the build-time `MODULES`
 * constant to the live registry snapshot: `bootEntries()` maps a snapshot onto
 * registry entries and `staticFloorEntries()` is the in-repo fallback floor.
 * `installedFrontendManifests()` walks that floor synchronously (the source
 * the capture-overlay / manifest-validation tests read); the live install set
 * is resolved by the async boot path (see `boot-snapshot.test.ts`).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { isInstalledModule } from '@pops/module-registry';

import { WORKSPACE_BUNDLE_MAP } from './bundle-map';
import {
  __resetInstalledFrontendManifestsOverride,
  __setInstalledFrontendManifestsOverride,
  bootEntries,
  filterAppManifests,
  hasRoutes,
  installedAppManifests,
  installedFrontendManifests,
  staticFloorEntries,
  type FrontendManifest,
} from './installed-modules';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

const SYNTHETIC_FINANCE: FrontendManifest = {
  id: 'finance',
  name: 'Finance (test)',
  surfaces: ['app'],
  frontend: {
    routes: [{ index: true, element: null }],
  },
};

const SYNTHETIC_INVENTORY_NO_ROUTES: FrontendManifest = {
  id: 'inventory',
  name: 'Inventory (test, no routes)',
  surfaces: ['app'],
};

const SYNTHETIC_EGO_OVERLAY: FrontendManifest = {
  id: 'ego',
  name: 'Ego (test, overlay-only)',
  surfaces: ['overlay'],
  frontend: {
    overlay: { chromeSlot: 'assistant' },
  },
};

/**
 * Minimal manifest payload satisfying `ManifestPayloadSchema`'s required
 * fields. Tests spread `extra` to add the surface (`assetsBaseUrl` / `nav` /
 * `pages`) the entry under test exercises.
 */
function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: [],
    search: { enabled: false },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: [],
    healthcheck: { path: '/health' },
    ...extra,
  } as ManifestPayload;
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

describe('staticFloorEntries', () => {
  it('lists the installed in-repo bundle-map pillars as registry entries', () => {
    // The unit-test env leaves `POPS_APPS` unset, so every bundle-map pillar
    // is installed and the floor covers the full map. The `isInstalledModule`
    // narrowing it applies is exercised by the finance-only install-set e2e.
    const ids = staticFloorEntries().map((e) => e.pillarId);
    expect(new Set(ids)).toEqual(new Set(Object.keys(WORKSPACE_BUNDLE_MAP)));
    for (const id of ids) {
      expect(isInstalledModule(id)).toBe(true);
    }
  });

  it('carries only the pillar id (in-repo pillars resolve via the bundle map)', () => {
    for (const entry of staticFloorEntries()) {
      expect(entry.assetsBaseUrl).toBeUndefined();
      expect(entry.nav).toBeUndefined();
      expect(entry.pages).toBeUndefined();
    }
  });
});

describe('bootEntries (P7-T03 snapshot → registry entries)', () => {
  it('maps registered snapshot entries onto registry entries', () => {
    const entries = bootEntries([snapshotEntry('finance'), snapshotEntry('media')]);
    expect(entries.map((e) => e.pillarId)).toEqual(['finance', 'media']);
  });

  it('drops entries that are not registered', () => {
    const entries = bootEntries([
      snapshotEntry('finance'),
      snapshotEntry('media', { registered: false }),
    ]);
    expect(entries.map((e) => e.pillarId)).toEqual(['finance']);
  });

  it('threads an external pillar surface (assetsBaseUrl / nav / pages) off the manifest', () => {
    const nav = {
      id: 'weather',
      label: 'Weather',
      labelKey: 'weather',
      icon: 'Compass',
      basePath: '/weather',
      order: 80,
      items: [{ path: '', label: 'Home', labelKey: 'weather.home', icon: 'Compass' }],
    };
    const pages = [{ path: '', index: true, bundleSlot: 'home' }];
    const [entry] = bootEntries([
      snapshotEntry('weather', {
        manifest: {
          assetsBaseUrl: 'https://cdn.example.com/weather/index.js',
          nav,
          pages,
        },
      }),
    ]);
    expect(entry?.assetsBaseUrl).toBe('https://cdn.example.com/weather/index.js');
    expect(entry?.nav).toEqual(nav);
    expect(entry?.pages).toEqual(pages);
  });

  it('omits the external-UI fields for an in-repo (no assetsBaseUrl) pillar', () => {
    const [entry] = bootEntries([snapshotEntry('finance')]);
    expect(entry?.pillarId).toBe('finance');
    expect(entry?.assetsBaseUrl).toBeUndefined();
    expect(entry?.nav).toBeUndefined();
    expect(entry?.pages).toBeUndefined();
  });
});

describe('installedAppManifests', () => {
  afterEach(() => {
    __resetInstalledFrontendManifestsOverride();
  });

  it('returns every installed manifest that declares both app surface and frontend.routes', () => {
    __setInstalledFrontendManifestsOverride([
      SYNTHETIC_FINANCE,
      SYNTHETIC_INVENTORY_NO_ROUTES,
      SYNTHETIC_EGO_OVERLAY,
    ]);
    const ids = installedAppManifests().map((m) => m.id);
    // Inventory is excluded — declares 'app' surface but no routes.
    // Ego is excluded — declares 'overlay' surface only.
    expect(ids).toEqual(['finance']);
  });

  it('excludes overlay-only surfaces from the app route table', () => {
    __setInstalledFrontendManifestsOverride([SYNTHETIC_EGO_OVERLAY]);
    expect(installedAppManifests()).toEqual([]);
  });

  it('returns an empty list when no manifests are installed', () => {
    __setInstalledFrontendManifestsOverride([]);
    expect(installedAppManifests()).toEqual([]);
  });

  it('the static floor surfaces only well-formed manifests with app surfaces', () => {
    // No override applied — `installedFrontendManifests` walks the in-repo
    // bundle-map floor (P7-T03). The shell supports an empty install set, so
    // we assert the manifest contract for whatever the floor returns rather
    // than a minimum length.
    const live = installedFrontendManifests();
    expect(Array.isArray(live)).toBe(true);
    for (const m of live) {
      expect(typeof m.id).toBe('string');
      expect(Array.isArray(m.surfaces)).toBe(true);
    }
  });
});

describe('filterAppManifests', () => {
  it('keeps app-surfaced, route-bearing manifests and drops the rest', () => {
    const ids = filterAppManifests([
      SYNTHETIC_FINANCE,
      SYNTHETIC_INVENTORY_NO_ROUTES,
      SYNTHETIC_EGO_OVERLAY,
    ]).map((m) => m.id);
    expect(ids).toEqual(['finance']);
  });
});

describe('hasRoutes type guard', () => {
  it('narrows manifests with array routes', () => {
    expect(hasRoutes(SYNTHETIC_FINANCE)).toBe(true);
  });

  it('rejects manifests with no frontend block', () => {
    expect(hasRoutes(SYNTHETIC_INVENTORY_NO_ROUTES)).toBe(false);
  });

  it('rejects overlay-only manifests', () => {
    expect(hasRoutes(SYNTHETIC_EGO_OVERLAY)).toBe(false);
  });
});
