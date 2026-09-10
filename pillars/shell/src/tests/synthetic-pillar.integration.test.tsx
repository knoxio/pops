/**
 * Registry-driven shell UI integration test.
 *
 * Proves the lego: a synthetic pillar that ships **no** patch to
 * `installed-modules.ts`, `nav/registry.ts`, the router, or any `@pops/app-*`
 * package still flows through the shell's registry walk and mounts:
 *
 *   - its `nav` descriptor onto the app rail (via `buildRegisteredAppsFromBundleMap`),
 *   - its `pages` descriptors into the route tree (via `walkRegistry`),
 *   - and gets withdrawn when the registry entry is dropped — the same shell
 *     code does the deregistration walk.
 *
 * Everything the synthetic pillar contributes is declared **inline in this
 * file**, so the test would fail if mounting a pillar required a per-pillar
 * source edit anywhere in the shell.
 *
 * What this covers that `registry-walk.test.ts` does not: the routes are
 * rendered. The walk's own suite asserts route counts and paths; here the
 * lazy element resolves against a bundle and paints, which is the only
 * jsdom-level check that the descriptor→`import()`→component chain closes.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  hasRoutes,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from '../app/installed-modules';
import { buildRegisteredAppsFromBundleMap } from '../app/nav/registry';

import type { NavConfigDescriptor, PageDescriptor } from '@pops/pillar-sdk';

const SYNTHETIC_ID = 'synthetic-foo';
const SYNTHETIC_BASE_PATH = `/${SYNTHETIC_ID}`;
const SYNTHETIC_NAV_ORDER = 25;
const SYNTHETIC_BUNDLE_URL = 'https://cdn.example.com/synthetic-foo/index.js';

const SYNTHETIC_NAV: NavConfigDescriptor = {
  id: SYNTHETIC_ID,
  label: 'Synthetic Foo',
  labelKey: SYNTHETIC_ID,
  icon: 'bot',
  basePath: SYNTHETIC_BASE_PATH,
  order: SYNTHETIC_NAV_ORDER,
  items: [
    { path: '', label: 'Home', labelKey: `${SYNTHETIC_ID}.home`, icon: 'layout-dashboard' },
    { path: 'detail', label: 'Detail', labelKey: `${SYNTHETIC_ID}.detail`, icon: 'file-text' },
  ],
};

const SYNTHETIC_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'synthetic-home' },
  { path: 'detail', bundleSlot: 'synthetic-detail' },
];

const SYNTHETIC_ENTRY: RegistryEntry = {
  pillarId: SYNTHETIC_ID,
  assetsBaseUrl: SYNTHETIC_BUNDLE_URL,
  nav: SYNTHETIC_NAV,
  pages: SYNTHETIC_PAGES,
};

function syntheticBundle() {
  return Promise.resolve({
    bundles: {
      'synthetic-home': () => <div data-testid="synthetic-page">home</div>,
      'synthetic-detail': () => <div data-testid="synthetic-page">detail</div>,
    },
  });
}

function walkSynthetic(importer = syntheticBundle): readonly FrontendManifest[] {
  return walkRegistry([SYNTHETIC_ENTRY], importer);
}

function syntheticManifest(): FrontendManifest {
  const [manifest] = walkSynthetic();
  if (manifest === undefined) throw new Error('synthetic manifest not produced by the walk');
  return manifest;
}

function mountManifestRoutes(manifest: FrontendManifest, initialPath: string): void {
  if (!hasRoutes(manifest)) {
    throw new Error('synthetic manifest missing frontend.routes — test fixture is invalid');
  }
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={manifest.id} element={<Outlet />}>
          {manifest.frontend.routes.map((route) => (
            <Route
              key={route.path ?? (route.index === true ? '__index__' : 'unknown')}
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

describe('synthetic pillar mounts via registry', () => {
  it('app rail nav surfaces the synthetic pillar', () => {
    const apps = buildRegisteredAppsFromBundleMap({
      [SYNTHETIC_ID]: { manifest: syntheticManifest(), navOrder: SYNTHETIC_NAV_ORDER },
    });
    expect(apps.map((app) => app.id)).toEqual([SYNTHETIC_ID]);
  });

  it('registry walk emits the synthetic manifest with one route per advertised page', () => {
    const manifest = syntheticManifest();
    expect(hasRoutes(manifest)).toBe(true);
    expect(manifest.frontend?.routes).toHaveLength(SYNTHETIC_PAGES.length);
  });

  it('renders the index page from the bundle the wire manifest advertised', async () => {
    const importer = vi.fn(syntheticBundle);
    const [manifest] = walkSynthetic(importer);
    if (manifest === undefined) throw new Error('synthetic manifest not produced by the walk');

    mountManifestRoutes(manifest, SYNTHETIC_BASE_PATH);

    expect(await screen.findByTestId('synthetic-page')).toHaveTextContent('home');
    expect(importer).toHaveBeenCalledWith(SYNTHETIC_BUNDLE_URL);
  });

  it('renders a non-index page, which the index slot would mask', async () => {
    mountManifestRoutes(syntheticManifest(), `${SYNTHETIC_BASE_PATH}/detail`);
    expect(await screen.findByTestId('synthetic-page')).toHaveTextContent('detail');
  });

  it('deregistering the synthetic pillar removes nav + manifest from the shell walk', () => {
    expect(walkRegistry([], syntheticBundle)).toEqual([]);
    expect(buildRegisteredAppsFromBundleMap({})).toEqual([]);
  });
});
