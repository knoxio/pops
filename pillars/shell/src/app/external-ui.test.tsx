/**
 * External-pillar UI loading (Option A) unit tests.
 *
 * Exercises the runtime loader end to end against a fake remote bundle so
 * no network round-trip is needed:
 *
 *   - A registered pillar whose manifest advertises an `assetsBaseUrl` +
 *     `pages` has its remote component lazily imported and rendered under
 *     its route.
 *   - A failed remote load (rejected import, missing slot, bad bundle
 *     shape) degrades to the error-boundary placeholder — the shell does
 *     not crash.
 *   - The synthesizer only ever consumes the wire descriptor: there is no
 *     static bundle map left for it to reach around.
 *
 * Those all inject a fake importer. The last describe here does not: it runs
 * `defaultRemoteModuleImporter` — the function production uses — against a
 * real ESM file on disk, because until POPS-3216 audited it nothing in the
 * repo had ever imported anything through this loader, and a loader proven
 * only against object literals is a loader whose import path is untested.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { render, screen, waitFor } from '@testing-library/react';
import { lazy } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultRemoteModuleImporter,
  synthesizeExternalBundleEntry,
  type RemoteModuleImporter,
  type RemoteUiDescriptor,
} from './external-ui';
import { hasRoutes } from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router';

import type { BundleEntry } from './bundle-entry';

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
      icon: 'compass',
      basePath: '/acme',
      order: 42,
      items: [{ path: '', label: 'Home', labelKey: 'acme.home', icon: 'compass' }],
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

  /**
   * The wire's icon ids are `KebabIdentifierSchema`, so kebab-case is the only
   * form a pillar may legally send — and `iconMap` is keyed by PascalCase. The
   * shared fixture above spelled its icons PascalCase, which the wire rejects,
   * so nothing exercised the form real pillars use and every one of them
   * resolved to the fallback.
   */
  it('resolves the kebab-case icon id the wire schema requires', () => {
    const entry = synthesizeExternalBundleEntry(
      descriptor({
        nav: {
          id: 'acme',
          label: 'Acme',
          labelKey: 'acme',
          icon: 'dollar-sign',
          basePath: '/acme',
          order: 1,
          items: [{ path: '', label: 'Usage', labelKey: 'acme.usage', icon: 'bar-chart-3' }],
        },
      })
    );
    expect(entry).not.toBeNull();
    if (entry === null) return;
    const nav = navOf('acme', entry);
    expect(nav?.icon).toBe('DollarSign');
    // A trailing digit is its own segment in the Lucide name, so the
    // conversion has to leave it attached rather than title-casing a number.
    expect(nav?.items[0]?.icon).toBe('BarChart3');
  });

  // A descriptor built in-repo may still spell an icon the way `iconMap` does.
  it('resolves a PascalCase icon id unchanged', () => {
    const entry = synthesizeExternalBundleEntry(
      descriptor({
        nav: {
          id: 'acme',
          label: 'Acme',
          labelKey: 'acme',
          icon: 'Smartphone',
          basePath: '/acme',
          order: 1,
          items: [{ path: '', label: 'Home', labelKey: 'acme.home', icon: 'Smartphone' }],
        },
      })
    );
    expect(entry).not.toBeNull();
    if (entry === null) return;
    expect(navOf('acme', entry)?.icon).toBe('Smartphone');
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

/**
 * The production importer, against a real module.
 *
 * `defaultRemoteModuleImporter` had never been run by anything: every test
 * above injects a fake resolving an object literal, so what was covered was
 * the synthesis and the failure containment, never the import itself
 * (POPS-3216 §1). The subject here is a hand-written ESM fixture in the shape
 * a pillar's remote build emits — whether a given pillar's build actually
 * produces such a module is that pillar's test to own.
 */
describe('defaultRemoteModuleImporter — the production import path', () => {
  const FIXTURE = pathToFileURL(
    path.join(import.meta.dirname, '__fixtures__/remote-pillar-bundle.mjs')
  ).href;

  it('imports a real ESM module and exposes its bundles record', async () => {
    const imported = await defaultRemoteModuleImporter(FIXTURE);

    expect(imported).toHaveProperty('bundles');
    const { bundles } = imported as { bundles: Record<string, unknown> };
    expect(typeof bundles['home']).toBe('function');
  });

  it('mounts a component that came from a real import, through the loader', async () => {
    const entry = synthesizeExternalBundleEntry(descriptor({ assetsBaseUrl: FIXTURE }));
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() => expect(screen.getByTestId('imported-from-disk')).toBeInTheDocument());
  });

  // A URL that resolves to nothing is the ordinary production failure — a
  // pillar deployed with its bundle missing, or an `assetsBaseUrl` that has
  // moved. It has to reach the boundary as a rejection rather than as an
  // unhandled load.
  it('rejects for a URL that does not resolve', async () => {
    const missing = pathToFileURL(path.join(import.meta.dirname, '__fixtures__/absent.mjs')).href;
    await expect(defaultRemoteModuleImporter(missing)).rejects.toThrow();
  });
});

/**
 * A pillar that code-splits its pages puts `React.lazy` components in
 * `bundles` — the ordinary thing to do, and what every in-repo pillar does.
 * React refuses a lazy that resolves to another lazy ("Lazy element type must
 * resolve to a class or function"), so mounting one used to fail with an error
 * naming double-wrapping rather than the bundle, on every page of the pillar.
 * Found by loading a real purchases bundle in a browser; no test built on
 * plain function components could have.
 */
describe('a remote bundle whose components are themselves lazy', () => {
  it('mounts a lazy component from the bundle', async () => {
    const LazyRemoteHome = lazy(() =>
      Promise.resolve({ default: () => <div data-testid="lazy-remote-home">lazy home</div> })
    );
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({ bundles: { home: LazyRemoteHome } })
    );
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() => expect(screen.getByTestId('lazy-remote-home')).toBeInTheDocument());
  });

  it('still mounts a plain function component', async () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve(VALID_BUNDLE));
    const entry = synthesizeExternalBundleEntry(descriptor(), importer);
    if (entry === null) throw new Error('expected a synthesized entry');

    mountSynthesizedRoutes(routesOf(entry), '/acme');

    await waitFor(() => expect(screen.getByTestId('remote-home')).toBeInTheDocument());
  });
});

/**
 * Nested pages (POPS-3256).
 *
 * `food` and `inventory` nest their routes: a layout whose element renders
 * tab chrome around an `<Outlet/>`, with the tabs beneath it. A flat wire
 * could only carry that by flattening it, which would remount the layout on
 * every tab switch. These assert the tree survives the wire, and — the half
 * that matters more — that the loader's failure containment is per node, so
 * one unresolvable tab does not take the layout or its siblings with it.
 */
describe('external pillar UI — nested pages', () => {
  function Layout() {
    return (
      <div>
        <span data-testid="layout-chrome">tabs</span>
        <Outlet />
      </div>
    );
  }
  const TabA = () => <div data-testid="tab-a">tab a</div>;
  const TabB = () => <div data-testid="tab-b">tab b</div>;

  const NESTED_DESCRIPTOR: RemoteUiDescriptor = {
    pillarId: 'acme',
    assetsBaseUrl: 'https://cdn.example.com/acme/index.js',
    nav: {
      id: 'acme',
      label: 'Acme',
      labelKey: 'acme',
      icon: 'compass',
      basePath: '/acme',
      order: 1,
      items: [{ path: '', label: 'Home', labelKey: 'acme.home', icon: 'compass' }],
    },
    pages: [
      {
        path: 'data',
        bundleSlot: 'layout',
        children: [
          { path: '', index: true, bundleSlot: 'tab-a' },
          { path: 'b', bundleSlot: 'tab-b' },
        ],
      },
    ],
  };

  /** Render synthesized routes, following `children`, at one URL. */
  function mountNested(routes: readonly RouteObject[], at: string): void {
    // Index and layout routes are rendered as separate shapes, because
    // `RouteProps` is the same union `RouteObject` is: an index route takes
    // no children, and passing both is a type error rather than a runtime one.
    const toElement = (list: readonly RouteObject[]): ReactElement[] =>
      list.map((route, i) =>
        route.index === true ? (
          <Route key={`__index__${i}`} index element={route.element} />
        ) : (
          <Route key={route.path ?? String(i)} path={route.path} element={route.element}>
            {route.children === undefined ? null : toElement(route.children)}
          </Route>
        )
      );
    render(
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="acme" element={<Outlet />}>
            {toElement(routes)}
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  function routesOf(bundles: Record<string, unknown>): readonly RouteObject[] {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve({ bundles }));
    const entry = synthesizeExternalBundleEntry(NESTED_DESCRIPTOR, importer);
    if (entry === null) throw new Error('descriptor did not synthesize');
    if (!hasRoutes(entry.manifest)) throw new Error('synthesized entry is missing frontend.routes');
    return entry.manifest.frontend.routes;
  }

  it('mounts the layout with its index child beneath it', async () => {
    mountNested(routesOf({ layout: Layout, 'tab-a': TabA, 'tab-b': TabB }), '/acme/data');

    expect(await screen.findByTestId('layout-chrome')).toBeInTheDocument();
    expect(await screen.findByTestId('tab-a')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-b')).not.toBeInTheDocument();
  });

  it('mounts a named child under the same layout', async () => {
    mountNested(routesOf({ layout: Layout, 'tab-a': TabA, 'tab-b': TabB }), '/acme/data/b');

    expect(await screen.findByTestId('layout-chrome')).toBeInTheDocument();
    expect(await screen.findByTestId('tab-b')).toBeInTheDocument();
  });

  /**
   * The containment claim. A bundle missing one tab's slot must lose that tab
   * and nothing else — if the boundary were per pillar rather than per node,
   * the layout would go too and the reader would lose every sibling tab along
   * with the broken one.
   */
  it('degrades only the child whose slot is missing, keeping the layout', async () => {
    mountNested(routesOf({ layout: Layout, 'tab-a': TabA }), '/acme/data/b');

    expect(await screen.findByTestId('external-pillar-load-error')).toBeInTheDocument();
    expect(screen.getByTestId('layout-chrome')).toBeInTheDocument();
  });

  it('keeps the siblings of a broken child mountable', async () => {
    mountNested(routesOf({ layout: Layout, 'tab-a': TabA }), '/acme/data');

    expect(await screen.findByTestId('tab-a')).toBeInTheDocument();
    expect(screen.queryByTestId('external-pillar-load-error')).not.toBeInTheDocument();
  });
});

/**
 * Surfaces beyond pages (POPS-3266).
 *
 * A pillar can contribute a capture overlay and settings widgets as well as
 * routes, and both are resolved by looking a slot up in a `BundleEntry`. The
 * loader populated neither, so those surfaces vanished the moment their pillar
 * left the static bundle map — quietly, since the capture modal falls back to
 * an empty state and a settings group simply renders without its panel.
 */
describe('synthesizeExternalBundleEntry — capture overlay and settings widgets', () => {
  const OVERLAY_DESCRIPTOR = {
    bundleSlot: 'quick-add',
    order: 10,
    labelKey: 'acme.capture.label',
  } as const;

  function overlayDescriptor(overrides: Partial<RemoteUiDescriptor> = {}): RemoteUiDescriptor {
    return descriptor({ captureOverlay: OVERLAY_DESCRIPTOR, ...overrides });
  }

  it('carries no overlay record when the pillar declares none', () => {
    const entry = synthesizeExternalBundleEntry(descriptor());
    expect(entry?.captureOverlayBundles).toBeUndefined();
    expect(entry?.settingsWidgetBundles).toBeUndefined();
  });

  it('exposes the declared overlay slot on the synthesized entry', () => {
    const entry = synthesizeExternalBundleEntry(overlayDescriptor());
    expect(Object.keys(entry?.captureOverlayBundles ?? {})).toEqual(['quick-add']);
  });

  // The registry reads the descriptor off the manifest, so it has to be there
  // as well as in the bundle record — one without the other resolves to null.
  it('puts the descriptor on the manifest the registry ranks', () => {
    const entry = synthesizeExternalBundleEntry(overlayDescriptor());
    expect(entry?.manifest.frontend?.captureOverlay).toEqual(OVERLAY_DESCRIPTOR);
  });

  it('does not import the bundle while synthesizing the overlay', () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve(VALID_BUNDLE));
    synthesizeExternalBundleEntry(overlayDescriptor(), importer);
    expect(importer).not.toHaveBeenCalled();
  });

  it('mounts the overlay component from the remote bundle', async () => {
    const Overlay = () => <div data-testid="overlay-body">overlay</div>;
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({ bundles: { 'quick-add': Overlay } })
    );
    const entry = synthesizeExternalBundleEntry(overlayDescriptor(), importer);
    const Mount = entry?.captureOverlayBundles?.['quick-add']?.Mount;
    if (Mount === undefined) throw new Error('no Mount for the declared slot');

    render(<Mount onUnsavedChange={() => undefined} />);
    expect(await screen.findByTestId('overlay-body')).toBeInTheDocument();
  });

  /**
   * The claim most likely to break without anyone noticing. A wrapper that
   * dropped the props would render correctly and only reveal itself when
   * someone closed the modal mid-edit and lost the draft with no prompt.
   */
  it('forwards props to the overlay, so the unsaved signal still reaches the modal', async () => {
    function Overlay({ onUnsavedChange }: { onUnsavedChange: (next: boolean) => void }) {
      return (
        <button type="button" onClick={() => onUnsavedChange(true)}>
          type something
        </button>
      );
    }
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({ bundles: { 'quick-add': Overlay } })
    );
    const entry = synthesizeExternalBundleEntry(overlayDescriptor(), importer);
    const Mount = entry?.captureOverlayBundles?.['quick-add']?.Mount;
    if (Mount === undefined) throw new Error('no Mount for the declared slot');

    const onUnsavedChange = vi.fn<(next: boolean) => void>();
    render(<Mount onUnsavedChange={onUnsavedChange} />);
    (await screen.findByRole('button', { name: 'type something' })).click();
    expect(onUnsavedChange).toHaveBeenCalledWith(true);
  });

  // Same containment as a page: the modal shows the placeholder rather than
  // taking the shell down with it.
  it('degrades to the placeholder when the bundle lacks the overlay slot', async () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve({ bundles: {} }));
    const entry = synthesizeExternalBundleEntry(overlayDescriptor(), importer);
    const Mount = entry?.captureOverlayBundles?.['quick-add']?.Mount;
    if (Mount === undefined) throw new Error('no Mount for the declared slot');

    render(<Mount onUnsavedChange={() => undefined} />);
    expect(await screen.findByTestId('external-pillar-load-error')).toBeInTheDocument();
  });

  it('exposes each declared settings-widget slot', () => {
    const entry = synthesizeExternalBundleEntry(
      descriptor({ settingsWidgetSlots: ['plex-connect', 'rotation-tuning'] })
    );
    expect(Object.keys(entry?.settingsWidgetBundles ?? {}).toSorted()).toEqual([
      'plex-connect',
      'rotation-tuning',
    ]);
  });

  it('mounts a settings widget from the remote bundle', async () => {
    const Widget = () => <div data-testid="widget-body">widget</div>;
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({ bundles: { 'plex-connect': Widget } })
    );
    const entry = synthesizeExternalBundleEntry(
      descriptor({ settingsWidgetSlots: ['plex-connect'] }),
      importer
    );
    const Widget_ = entry?.settingsWidgetBundles?.['plex-connect'];
    if (Widget_ === undefined) throw new Error('no component for the declared widget slot');

    render(<Widget_ />);
    expect(await screen.findByTestId('widget-body')).toBeInTheDocument();
  });
});
