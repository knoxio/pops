/**
 * Registry-walk unit tests.
 *
 * Exercises the discovery path with synthetic registry entries. This file
 * pins the walk's contract:
 *
 *   - Two synthetic pillars produce two nav configs.
 *   - Manifests synthesized by the walk preserve one route per `pages` entry.
 *   - Pillars omitting both `nav` and `pages` are skipped from the rail.
 *   - A pillar that advertises an `assetsBaseUrl` plus `nav` / `pages` is
 *     loaded via the runtime path (Option A) and contributes a mounted
 *     manifest — lazily, without the walk fetching its bundle.
 *   - A structurally broken descriptor is logged once and skipped (no crash).
 *   - Sort order respects `navOrder` ascending with a lexicographic
 *     tiebreak on the nav id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveBootRegistry } from './boot-snapshot';
import {
  hasRoutes,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

import type { NavConfigDescriptor, PageDescriptor, PillarSnapshot } from '@pops/pillar-sdk';

import type { BundleEntry } from './bundle-entry';
import type { AppNavConfig } from './nav/types';

function manifestFor(
  id: string,
  navConfig: AppNavConfig | undefined,
  routes: ReadonlyArray<{ path?: string; index?: boolean }> | undefined
): FrontendManifest {
  const frontend: FrontendManifest['frontend'] = {};
  if (navConfig !== undefined) frontend.navConfig = navConfig;
  if (routes !== undefined) frontend.routes = [...routes];
  return {
    id,
    name: id,
    surfaces: ['app'],
    frontend,
  };
}

function navFor(id: string, label: string): AppNavConfig {
  return {
    id,
    label,
    labelKey: id,
    icon: 'Bot',
    basePath: `/${id}`,
    items: [{ path: '', label: 'Home', labelKey: `${id}.home`, icon: 'LayoutDashboard' }],
  };
}

/**
 * A loader-mounted pillar's registry entry: the wire nav descriptor (kebab
 * icons, which is what the wire schema permits) plus its page descriptors.
 */
function loaderEntry(id: string, order: number, pages: readonly PageDescriptor[]): RegistryEntry {
  return {
    pillarId: id,
    assetsBaseUrl: `/${id}-ui/${id}.js`,
    nav: {
      id,
      label: id,
      labelKey: id,
      icon: 'compass',
      basePath: `/${id}`,
      order,
      items: [{ path: '', label: 'Home', labelKey: `${id}.home`, icon: 'compass' }],
    },
    pages: [...pages],
  };
}

/** A registry snapshot row carrying one entry's wire manifest. */
function snapshotOf(entry: RegistryEntry): PillarSnapshot {
  const { pillarId, nav, pages, assetsBaseUrl } = entry;
  const ui = {
    ...(assetsBaseUrl === undefined ? {} : { assetsBaseUrl }),
    ...(nav === undefined ? {} : { nav }),
    // The wire type is mutable where the entry's is readonly; the snapshot is
    // a payload, not a view of the entry.
    ...(pages === undefined ? {} : { pages: [...pages] }),
  };
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    registered: true,
    lastSeenAt: new Date('2026-09-08T00:00:00.000Z'),
    manifest: {
      pillar: pillarId,
      version: '0.1.0',
      contract: {
        package: `@pops/${pillarId}`,
        version: '0.1.0',
        tag: `contract-${pillarId}@v0.1.0`,
      },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
      ...ui,
    },
  };
}

describe('walkRegistry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('emits one manifest per registered pillar that advertises a UI bundle', () => {
    const entries: RegistryEntry[] = [
      loaderEntry('finance', 10, [{ path: '', index: true, bundleSlot: 'finance-home' }]),
      loaderEntry('media', 20, [{ path: '', index: true, bundleSlot: 'media-home' }]),
    ];

    const out = walkRegistry(entries);

    expect(out.map((m) => m.id)).toEqual(['finance', 'media']);
  });

  it('preserves frontend.routes on the synthesized manifest so the router can mount them', () => {
    const entries: RegistryEntry[] = [
      loaderEntry('finance', 10, [
        { path: '', index: true, bundleSlot: 'finance-home' },
        { path: 'transactions', bundleSlot: 'finance-transactions' },
      ]),
    ];

    const out = walkRegistry(entries);
    const financeRoutes = out[0]?.frontend?.routes;

    expect(Array.isArray(financeRoutes)).toBe(true);
    expect(financeRoutes).toHaveLength(2);
  });

  it('skips registered pillars whose bundle map entry omits a navConfig', () => {
    const bundleMap: Record<string, BundleEntry> = {
      finance: {
        manifest: manifestFor('finance', navFor('finance', 'Finance'), [{ index: true }]),
        navOrder: 10,
      },
      backendOnly: {
        manifest: manifestFor('backendOnly', undefined, undefined),
        navOrder: 999,
      },
    };

    const apps = buildRegisteredAppsFromBundleMap(bundleMap);

    expect(apps.map((a) => a.id)).toEqual(['finance']);
  });

  it('mounts an external pillar (no bundle map entry) via the runtime loader (Option A)', () => {
    const externalNav: NavConfigDescriptor = {
      id: 'external-pillar',
      label: 'External Pillar',
      labelKey: 'externalPillar',
      icon: 'Compass',
      basePath: '/external-pillar',
      order: 35,
      items: [{ path: '', label: 'Home', labelKey: 'externalPillar.home', icon: 'Compass' }],
    };
    const externalPages: PageDescriptor[] = [{ path: '', index: true, bundleSlot: 'home' }];
    const entries: RegistryEntry[] = [
      {
        pillarId: 'external-pillar',
        assetsBaseUrl: 'https://cdn.example.com/external/index.js',
        nav: externalNav,
        pages: externalPages,
      },
    ];

    // Importer is never invoked here: synthesis is synchronous; the remote
    // bundle is fetched lazily only when the route actually renders.
    const out = walkRegistry(entries, () =>
      Promise.reject(new Error('importer must not run during synthesis'))
    );

    expect(out).toHaveLength(1);
    const manifest = out[0];
    expect(manifest?.id).toBe('external-pillar');
    expect(manifest?.surfaces).toContain('app');
    expect(manifest !== undefined && hasRoutes(manifest)).toBe(true);
    if (manifest !== undefined && hasRoutes(manifest)) {
      expect(manifest.frontend.routes).toHaveLength(1);
    }
    const navIds = buildRegisteredAppsFromBundleMap({
      'external-pillar': {
        manifest: manifest as FrontendManifest,
        navOrder: externalNav.order,
      },
    }).map((app) => app.id);
    expect(navIds).toContain('external-pillar');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips an external pillar that advertises an asset URL but no nav/pages (nothing to mount)', () => {
    const entries: RegistryEntry[] = [
      { pillarId: 'external-headless', assetsBaseUrl: 'https://cdn.example.com/headless.js' },
    ];

    const out = walkRegistry(entries);

    expect(out).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sorts registeredApps by navOrder ascending with a lexicographic tiebreak on id', () => {
    const bundleMap: Record<string, BundleEntry> = {
      gamma: {
        manifest: manifestFor('gamma', navFor('gamma', 'Gamma'), [{ index: true }]),
        navOrder: 30,
      },
      alpha: {
        manifest: manifestFor('alpha', navFor('alpha', 'Alpha'), [{ index: true }]),
        navOrder: 10,
      },
      betaA: {
        manifest: manifestFor('beta-a', navFor('beta-a', 'Beta A'), [{ index: true }]),
        navOrder: 20,
      },
      betaB: {
        manifest: manifestFor('beta-b', navFor('beta-b', 'Beta B'), [{ index: true }]),
        navOrder: 20,
      },
    };

    const apps = buildRegisteredAppsFromBundleMap(bundleMap);

    expect(apps.map((a) => a.id)).toEqual(['alpha', 'beta-a', 'beta-b', 'gamma']);
  });
});

/**
 * Purchases, mounted the way it now actually arrives (POPS-3217).
 *
 * The pillar left `WORKSPACE_BUNDLE_MAP` and `@pops/shell` stopped depending
 * on `@pops/app-purchases`, so what reaches the shell is a wire snapshot and
 * a URL. This walks that snapshot straight through `walkRegistry`, which has
 * no bundle map to consult at all — POPS-3227 removed it — and asserts the
 * whole surface survives the crossing.
 *
 * The descriptor mirrors `pillars/purchases/src/api/manifest.ts`. It is
 * restated rather than imported because the shell has no dependency on the
 * purchases contract either, and acquiring one to write a test would put back
 * a smaller version of the coupling this ticket removed.
 */
describe('a pillar that reaches the shell only over the wire', () => {
  const PURCHASES_NAV: NavConfigDescriptor = {
    id: 'purchases',
    label: 'Purchases',
    labelKey: 'purchases',
    icon: 'receipt',
    color: 'rose',
    basePath: '/purchases',
    order: 15,
    items: [
      { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'receipt' },
      {
        path: '/merchants',
        label: 'Merchants',
        labelKey: 'purchases.merchants',
        icon: 'building-2',
      },
      { path: '/receipts', label: 'Receipts', labelKey: 'purchases.receipts', icon: 'file-text' },
      { path: '/products', label: 'Products', labelKey: 'purchases.products', icon: 'package' },
    ],
  };

  const PURCHASES_PAGES: readonly PageDescriptor[] = [
    { path: '', index: true, bundleSlot: 'purchases-reconcile' },
    { path: 'merchants', bundleSlot: 'purchases-merchants' },
    { path: 'receipts', bundleSlot: 'purchases-receipts' },
    { path: 'products', bundleSlot: 'purchases-products' },
    { path: ':purchaseId', bundleSlot: 'purchases-order' },
  ];

  const entry: RegistryEntry = {
    pillarId: 'purchases',
    assetsBaseUrl: '/purchases-ui/purchases.js',
    nav: PURCHASES_NAV,
    pages: PURCHASES_PAGES,
  };

  function walkPurchases(): readonly FrontendManifest[] {
    return walkRegistry([entry], () =>
      Promise.resolve({
        bundles: Object.fromEntries(PURCHASES_PAGES.map((page) => [page.bundleSlot, () => null])),
      })
    );
  }

  it('mounts with no bundle-map entry at all', () => {
    const out = walkPurchases();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('purchases');
  });

  it('mounts one route per advertised page', () => {
    const [manifest] = walkPurchases();
    if (manifest === undefined || !hasRoutes(manifest)) throw new Error('expected routes');
    expect(manifest.frontend.routes).toHaveLength(PURCHASES_PAGES.length);
  });

  // The page a rail entry cannot reach, and therefore the one that would have
  // gone missing without anyone noticing: the reconcile queue, the receipt
  // drop zone and every global-search hit produce a purchase id and link here.
  it('mounts the order page, which no nav item points at', () => {
    const [manifest] = walkPurchases();
    if (manifest === undefined || !hasRoutes(manifest)) throw new Error('expected routes');
    expect(manifest.frontend.routes.some((route) => route.path === ':purchaseId')).toBe(true);
  });

  it('renders the rail entry in its wire position, beside finance', () => {
    const [manifest] = walkPurchases();
    if (manifest === undefined) throw new Error('expected a manifest');
    const apps = buildRegisteredAppsFromBundleMap({
      finance: {
        manifest: manifestFor('finance', navFor('finance', 'Finance'), [{ index: true }]),
        navOrder: 10,
      },
      purchases: { manifest, navOrder: 15 },
      media: {
        manifest: manifestFor('media', navFor('media', 'Media'), [{ index: true }]),
        navOrder: 20,
      },
    });
    expect(apps.map((app) => app.id)).toEqual(['finance', 'purchases', 'media']);
  });

  // The rail comes off the wire and renders at boot; the bundle is fetched on
  // first navigation. A walk that imported eagerly would put a network fetch
  // per loader-mounted pillar in front of the first paint.
  it('does not fetch the bundle during the walk', () => {
    const importer = vi.fn(() => Promise.resolve({ bundles: {} }));
    walkRegistry([entry], importer);
    expect(importer).not.toHaveBeenCalled();
  });
});

/**
 * The boot resolver has to hand `main.tsx` the bundle URLs it will preload, and
 * only for pillars that actually mount: preloading a bundle nothing imports is
 * a request for nothing, and missing one puts its fetch back behind the
 * reader's navigation.
 */
describe('remote bundle URLs the boot resolver reports', () => {
  const wireEntry = (pillarId: string, assetsBaseUrl: string): RegistryEntry => ({
    pillarId,
    assetsBaseUrl,
    nav: {
      id: pillarId,
      label: pillarId,
      labelKey: pillarId,
      icon: 'Compass',
      basePath: `/${pillarId}`,
      order: 50,
      items: [{ path: '', label: 'Home', labelKey: `${pillarId}.home`, icon: 'Compass' }],
    },
    pages: [{ path: '', index: true, bundleSlot: `${pillarId}-home` }],
  });

  it('reports the URL of a loader-mounted pillar', () => {
    const resolved = resolveBootRegistry(
      [snapshotOf(wireEntry('purchases', '/purchases-ui/purchases.js'))],
      () => Promise.resolve({ bundles: { 'purchases-home': () => null } })
    );
    expect(resolved.remoteBundleUrls).toEqual(['/purchases-ui/purchases.js']);
  });

  // Advertised a bundle, offered nothing to mount from it. The walk drops the
  // pillar, so the preload must drop with it.
  it('reports nothing for a pillar that advertises a URL but no surface', () => {
    const resolved = resolveBootRegistry([
      snapshotOf({ pillarId: 'ghost', assetsBaseUrl: '/ghost-ui/ghost.js' }),
    ]);
    expect(resolved.remoteBundleUrls).toEqual([]);
  });

  it('reports nothing for an empty snapshot, which mounts nothing to preload', () => {
    expect(resolveBootRegistry([]).remoteBundleUrls).toEqual([]);
  });
});
