/**
 * External-pillar UI loading (Option A) unit tests.
 *
 * Exercises the runtime loader end to end against a fake remote bundle so
 * no network round-trip is needed:
 *
 *   - A registered external pillar (absent from the static bundle map)
 *     whose manifest advertises an `assetsBaseUrl` + `pages` has its remote
 *     component lazily imported and rendered under its route.
 *   - A failed remote load (rejected import, missing slot, bad bundle
 *     shape) degrades to the error-boundary placeholder — the shell does
 *     not crash.
 *   - In-repo pillars never reach this path: the synthesizer only consumes
 *     the wire descriptor, leaving the static bundle map untouched.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  synthesizeExternalBundleEntry,
  type RemoteModuleImporter,
  type RemoteUiDescriptor,
} from './external-ui';
import { hasRoutes } from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

import type { RouteObject } from 'react-router';

import type { BundleEntry } from './bundle-map';

/**
 * Pull the synthesized routes out of a bundle entry through the shared
 * `hasRoutes` guard so the test never asserts against the `unknown`-typed
 * `frontend.routes` slot directly.
 */
function routesOf(entry: BundleEntry): RouteObject[] {
  if (!hasRoutes(entry.manifest)) throw new Error('synthesized entry is missing frontend.routes');
  return entry.manifest.frontend.routes;
}

/** Nav config the app-rail walk derives from a single synthesized entry. */
function navOf(id: string, entry: BundleEntry) {
  return buildRegisteredAppsFromBundleMap({ [id]: entry }).find((app) => app.id === id);
}

function RemoteHome() {
  return <div data-testid="remote-home">remote home page</div>;
}

const VALID_BUNDLE = { bundles: { home: RemoteHome } };

function descriptor(overrides: Partial<RemoteUiDescriptor> = {}): RemoteUiDescriptor {
  return {
    pillarId: 'acme',
    assetsBaseUrl: 'https://cdn.example.com/acme/index.js',
    nav: {
      id: 'acme',
      label: 'Acme',
      labelKey: 'acme',
      icon: 'Compass',
      basePath: '/acme',
      order: 42,
      items: [{ path: '', label: 'Home', labelKey: 'acme.home', icon: 'Compass' }],
    },
    pages: [{ path: '', index: true, bundleSlot: 'home' }],
    ...overrides,
  };
}

function mountSynthesizedRoutes(routes: readonly RouteObject[], at: string): void {
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="acme" element={<Outlet />}>
          {routes.map((route, i) => (
            <Route
              key={route.path ?? (route.index ? '__index__' : String(i))}
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

describe('synthesizeExternalBundleEntry — descriptor → bundle entry', () => {
  it('derives navConfig + navOrder from the wire nav descriptor', () => {
    const entry = synthesizeExternalBundleEntry(descriptor());
    expect(entry).not.toBeNull();
    if (entry === null) return;
    expect(entry.navOrder).toBe(42);
    expect(navOf('acme', entry)?.id).toBe('acme');
    expect(entry.manifest.surfaces).toContain('app');
    expect(entry.assetsBaseUrl).toBe('https://cdn.example.com/acme/index.js');
  });

  it('falls back to a neutral icon when the wire nav icon is unknown', () => {
    const entry = synthesizeExternalBundleEntry(
      descriptor({
        nav: {
          id: 'acme',
          label: 'Acme',
          labelKey: 'acme',
          icon: 'not-a-real-icon',
          basePath: '/acme',
          order: 1,
          items: [{ path: '', label: 'Home', labelKey: 'acme.home', icon: 'also-fake' }],
        },
      })
    );
    expect(entry).not.toBeNull();
    if (entry === null) return;
    const nav = navOf('acme', entry);
    expect(nav?.icon).toBe('Compass');
    expect(nav?.items[0]?.icon).toBe('Compass');
  });

  it('returns null when the pillar advertises an asset URL but no nav/pages', () => {
    const entry = synthesizeExternalBundleEntry(descriptor({ nav: undefined, pages: undefined }));
    expect(entry).toBeNull();
  });

  it('does not import the remote bundle during synthesis (lazy on first render)', () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve(VALID_BUNDLE));
    synthesizeExternalBundleEntry(descriptor(), importer);
    expect(importer).not.toHaveBeenCalled();
  });
});

describe('external pillar UI — runtime mount (Option A)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lazily imports the remote bundle and renders its component under the route', async () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve(VALID_BUNDLE));
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() => expect(screen.getByTestId('remote-home')).toBeInTheDocument());
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('https://cdn.example.com/acme/index.js');
  });

  it('degrades to the error-boundary placeholder when the remote import rejects (no crash)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.reject(new Error('network down')));
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() =>
      expect(screen.getByTestId('external-pillar-load-error')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('remote-home')).not.toBeInTheDocument();
  });

  it('degrades gracefully when the remote bundle is missing the declared slot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({ bundles: { somethingElse: RemoteHome } })
    );
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() =>
      expect(screen.getByTestId('external-pillar-load-error')).toBeInTheDocument()
    );
  });

  it('degrades gracefully when the remote bundle has the wrong shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve({ notBundles: 1 }));
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() =>
      expect(screen.getByTestId('external-pillar-load-error')).toBeInTheDocument()
    );
  });
});
