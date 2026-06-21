/**
 * PRD-243 US-04 — registry-driven shell UI integration test.
 *
 * Closes audit M7. Proves the lego: a synthetic pillar that ships
 * **no** patch to `WORKSPACE_BUNDLE_MAP`, `installed-modules.ts`,
 * `nav/registry.ts`, the router, or any real `@pops/app-*` package
 * still flows through the shell's registry walk and mounts:
 *
 *   - its `nav.navConfig` into the app rail (via `buildRegisteredAppsFromBundleMap`),
 *   - its `frontend.routes` into the route tree (via `walkRegistry`),
 *   - and gets withdrawn when the registry entry / bundle map entry is
 *     dropped — the same shell code does the deregistration walk.
 *
 * The synthetic pillar's manifest, nav config, route fixture, and bundle
 * entry are all declared **inline in this test file**, so the test would
 * fail if any of those structures required a per-pillar source edit.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from '../app/bundle-map';
import {
  hasRoutes,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from '../app/installed-modules';
import { buildRegisteredAppsFromBundleMap } from '../app/nav/registry';

import type { RouteObject } from 'react-router';

import type { AppNavConfig } from '../app/nav/types';

const SYNTHETIC_ID = 'synthetic-foo';
const SYNTHETIC_BASE_PATH = `/${SYNTHETIC_ID}`;
const SYNTHETIC_NAV_ORDER = 25;

function SyntheticPage() {
  return <div data-testid="synthetic-page">synthetic</div>;
}

const SYNTHETIC_NAV: AppNavConfig = {
  id: SYNTHETIC_ID,
  label: 'Synthetic Foo',
  labelKey: SYNTHETIC_ID,
  icon: 'Bot',
  basePath: SYNTHETIC_BASE_PATH,
  items: [
    {
      path: '',
      label: 'Home',
      labelKey: `${SYNTHETIC_ID}.home`,
      icon: 'LayoutDashboard',
    },
  ],
};

const SYNTHETIC_ROUTES: RouteObject[] = [{ index: true, element: <SyntheticPage /> }];

const SYNTHETIC_MANIFEST: FrontendManifest = {
  id: SYNTHETIC_ID,
  name: 'Synthetic Foo',
  surfaces: ['app'],
  frontend: {
    routes: SYNTHETIC_ROUTES,
    navConfig: SYNTHETIC_NAV,
  },
};

const SYNTHETIC_BUNDLE_ENTRY: BundleEntry = {
  manifest: SYNTHETIC_MANIFEST,
  navOrder: SYNTHETIC_NAV_ORDER,
};

function bundleMapWithSynthetic(): Record<string, BundleEntry> {
  return { ...WORKSPACE_BUNDLE_MAP, [SYNTHETIC_ID]: SYNTHETIC_BUNDLE_ENTRY };
}

function registryEntriesForBundleMap(bundleMap: Record<string, BundleEntry>): RegistryEntry[] {
  return Object.keys(bundleMap).map((pillarId) => ({ pillarId }));
}

function mountManifestRoutes(manifest: FrontendManifest, initialPath: string): void {
  if (!hasRoutes(manifest)) {
    throw new Error(`synthetic manifest missing frontend.routes — test fixture is invalid`);
  }
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={manifest.id} element={<Outlet />}>
          {manifest.frontend.routes.map((route) => (
            <Route
              key={route.path ?? (route.index ? '__index__' : 'unknown')}
              index={route.index}
              path={route.path}
              element={route.element}
            />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('PRD-243 US-04 — synthetic pillar mounts via registry (audit M7)', () => {
  it('app rail nav surfaces the synthetic pillar at the navOrder-derived position', () => {
    const apps = buildRegisteredAppsFromBundleMap(bundleMapWithSynthetic());
    const ids = apps.map((app) => app.id);

    expect(ids).toContain(SYNTHETIC_ID);

    const realOrder = ['finance', 'media', 'inventory', 'food', 'lists', 'cerebrum', 'ai'];
    expect(ids).toEqual([
      'finance',
      'media',
      SYNTHETIC_ID,
      'inventory',
      'food',
      'lists',
      'cerebrum',
      'ai',
    ]);
    expect(realOrder.every((id) => ids.includes(id))).toBe(true);
  });

  it('registry walk emits the synthetic manifest with its frontend.routes preserved', () => {
    const bundleMap = bundleMapWithSynthetic();
    const manifests = walkRegistry(registryEntriesForBundleMap(bundleMap), bundleMap);

    const synthetic = manifests.find((m) => m.id === SYNTHETIC_ID);
    expect(synthetic).toBeDefined();
    expect(synthetic && hasRoutes(synthetic)).toBe(true);
    expect(synthetic?.frontend?.routes).toHaveLength(1);
  });

  it('routing under the synthetic basePath renders the fixture page (registry → router)', () => {
    const bundleMap = bundleMapWithSynthetic();
    const manifests = walkRegistry(registryEntriesForBundleMap(bundleMap), bundleMap);
    const synthetic = manifests.find((m) => m.id === SYNTHETIC_ID);
    if (synthetic === undefined) throw new Error('synthetic manifest not produced by walk');

    mountManifestRoutes(synthetic, SYNTHETIC_BASE_PATH);

    expect(screen.getByTestId('synthetic-page')).toHaveTextContent('synthetic');
  });

  it('deregistering the synthetic pillar removes nav + manifest from the shell walk', () => {
    const withSynthetic = bundleMapWithSynthetic();
    const withSyntheticIds = buildRegisteredAppsFromBundleMap(withSynthetic).map((a) => a.id);
    expect(withSyntheticIds).toContain(SYNTHETIC_ID);

    const withoutSynthetic = { ...withSynthetic };
    delete withoutSynthetic[SYNTHETIC_ID];

    const apps = buildRegisteredAppsFromBundleMap(withoutSynthetic);
    const manifests = walkRegistry(registryEntriesForBundleMap(withoutSynthetic), withoutSynthetic);

    expect(apps.map((a) => a.id)).not.toContain(SYNTHETIC_ID);
    expect(manifests.map((m) => m.id)).not.toContain(SYNTHETIC_ID);
  });

  it('an external registry entry (no bundle map entry) mounts via the runtime loader (US-05)', () => {
    const entries: RegistryEntry[] = [
      {
        pillarId: SYNTHETIC_ID,
        assetsBaseUrl: 'https://cdn.example.com/synthetic-foo/index.js',
        nav: {
          id: SYNTHETIC_ID,
          label: 'Synthetic Foo',
          labelKey: SYNTHETIC_ID,
          icon: 'Compass',
          basePath: SYNTHETIC_BASE_PATH,
          order: SYNTHETIC_NAV_ORDER,
          items: [{ path: '', label: 'Home', labelKey: `${SYNTHETIC_ID}.home`, icon: 'Compass' }],
        },
        pages: [{ path: '', index: true, bundleSlot: 'home' }],
      },
    ];

    // No bundle map entry at all — the synthetic pillar is external. The
    // importer never runs during the walk (lazy on first route render).
    const manifests = walkRegistry(entries, {}, () =>
      Promise.reject(new Error('importer must not run during synthesis'))
    );

    expect(manifests).toHaveLength(1);
    const mounted = manifests[0];
    expect(mounted?.id).toBe(SYNTHETIC_ID);
    expect(mounted !== undefined && hasRoutes(mounted)).toBe(true);

    const navIds = buildRegisteredAppsFromBundleMap({
      [SYNTHETIC_ID]: { manifest: mounted as FrontendManifest, navOrder: SYNTHETIC_NAV_ORDER },
    }).map((app) => app.id);
    expect(navIds).toContain(SYNTHETIC_ID);
  });
});
