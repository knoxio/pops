/**
 * PRD-243 US-03 — registry-walk unit tests.
 *
 * Exercises the bundle-map-driven discovery path with synthetic data
 * instead of the live `WORKSPACE_BUNDLE_MAP` / `MODULES` constants. The
 * existing override-based `installed-modules.test.ts` covers the
 * production wiring; this file pins the walk's contract:
 *
 *   - Two synthetic pillars produce two nav configs.
 *   - Frontend manifests joined through the walk preserve `frontend.routes`.
 *   - Pillars omitting both `nav` and `pages` are skipped from the rail.
 *   - Pillars advertising an `assetsBaseUrl` without a bundle entry log
 *     once and are skipped (the US-05 stub branch).
 *   - Sort order respects `navOrder` ascending with a lexicographic
 *     tiebreak on the nav id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ExternalUiLoadingNotImplementedError,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

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

  it('logs and skips a registry entry that advertises assetsBaseUrl without a bundle map entry (US-05 stub branch)', () => {
    const bundleMap: Record<string, BundleEntry> = {};
    const entries: RegistryEntry[] = [
      { pillarId: 'external-pillar', assetsBaseUrl: 'https://cdn.example.com/external/' },
    ];

    const out = walkRegistry(entries, bundleMap);

    expect(out).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(message).toContain('external UI loading not implemented');
    expect(message).toContain('external-pillar');
    expect(message).toContain('https://cdn.example.com/external/');
  });

  it('exposes the US-05 stub failure as a structured error type callers can detect', () => {
    const err = new ExternalUiLoadingNotImplementedError('foo', 'https://x/');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ExternalUiLoadingNotImplementedError');
    expect(err.pillarId).toBe('foo');
    expect(err.assetsBaseUrl).toBe('https://x/');
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
