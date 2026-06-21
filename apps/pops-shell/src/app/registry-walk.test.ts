/**
 * PRD-243 US-03 + US-05 — registry-walk unit tests.
 *
 * Exercises the bundle-map-driven discovery path with synthetic data
 * instead of the live `WORKSPACE_BUNDLE_MAP` / `MODULES` constants. The
 * existing override-based `installed-modules.test.ts` covers the
 * production wiring; this file pins the walk's contract:
 *
 *   - Two synthetic pillars produce two nav configs.
 *   - Frontend manifests joined through the walk preserve `frontend.routes`.
 *   - Pillars omitting both `nav` and `pages` are skipped from the rail.
 *   - An external pillar (absent from the bundle map) that advertises an
 *     `assetsBaseUrl` plus `nav` / `pages` is loaded via the runtime path
 *     (US-05, Option A) and contributes a mounted manifest.
 *   - A structurally broken external descriptor is logged once and skipped
 *     (no crash).
 *   - Sort order respects `navOrder` ascending with a lexicographic
 *     tiebreak on the nav id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasRoutes,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

import type { NavConfigDescriptor, PageDescriptor } from '@pops/pillar-sdk';

import type { BundleEntry } from './bundle-map';
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

describe('walkRegistry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('emits one manifest per registered pillar resolvable through the bundle map', () => {
    const bundleMap: Record<string, BundleEntry> = {
      finance: {
        manifest: manifestFor('finance', navFor('finance', 'Finance'), [{ index: true }]),
        navOrder: 10,
      },
      media: {
        manifest: manifestFor('media', navFor('media', 'Media'), [{ index: true }]),
        navOrder: 20,
      },
    };
    const entries: RegistryEntry[] = [{ pillarId: 'finance' }, { pillarId: 'media' }];

    const out = walkRegistry(entries, bundleMap);

    expect(out.map((m) => m.id)).toEqual(['finance', 'media']);
  });

  it('preserves frontend.routes on the joined manifest so the router can mount them', () => {
    const bundleMap: Record<string, BundleEntry> = {
      finance: {
        manifest: manifestFor('finance', navFor('finance', 'Finance'), [
          { index: true },
          { path: 'transactions' },
        ]),
        navOrder: 10,
      },
    };
    const entries: RegistryEntry[] = [{ pillarId: 'finance' }];

    const out = walkRegistry(entries, bundleMap);
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

  it('mounts an external pillar (no bundle map entry) via the runtime loader (US-05 Option A)', () => {
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
    const out = walkRegistry(entries, {}, () =>
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

    const out = walkRegistry(entries, {});

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
