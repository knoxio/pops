/**
 * Shell route table — composed from the boot-resolved install set
 * (`boot-snapshot.ts` → resolved `FrontendManifest[]`).
 *
 * App route entries derive from the install set; direct navigation to an
 * absent module's URL renders `NotInstalledPage` via the catch-all.
 *
 * The install-set source is the live registry snapshot, resolved before
 * first render — not the build-time `MODULES` constant. The router is built
 * by {@link buildRouter} (called from `App.tsx` with the boot-resolved
 * manifests) rather than a module-eval constant.
 */
import { Suspense } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, useLocation } from 'react-router';

import { KNOWN_MODULES } from '@pops/module-registry';

import { IndexRedirect } from './IndexRedirect';
import { filterAppManifests, type FrontendManifest } from './installed-modules';
import { RootLayout } from './layout/RootLayout';
import { FeaturesPage } from './pages/features-page/FeaturesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotInstalledPage } from './pages/NotInstalledPage';
import { SettingsPage } from './pages/SettingsPage';
import { PillarGuard, pillarIdForModule } from './pillars';

import type { RouteObject } from 'react-router';

/**
 * Catch-all element: if the URL's first path segment names a module the
 * codebase could ship (`KNOWN_MODULES`) that isn't installed in this build,
 * render `NotInstalledPage`. Otherwise fall through to `NotFoundPage`.
 *
 * `KNOWN_MODULES` is `@pops/module-registry`'s disk-discovered superset of
 * every in-repo pillar manifest — the right "could-ship" set, broader than
 * the per-deploy install set (`POPS_APPS`-gated) so the "not installed"
 * message fires for an excluded-but-buildable module while truly unknown
 * paths still get a proper 404. Sourcing it off this runtime set (not a
 * frozen SDK tuple) means adding a pillar needs no SDK type edit.
 */
function UnmatchedRoute() {
  const { pathname } = useLocation();
  const first = pathname.split('/').find((s) => s.length > 0) ?? '';
  const knownModules: readonly string[] = KNOWN_MODULES;
  if (first.length > 0 && knownModules.includes(first)) {
    return <NotInstalledPage />;
  }
  return <NotFoundPage />;
}

const SuspenseFallback = (
  <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
);

/**
 * Wrap a route subtree in `<Suspense>` so React can show a fallback while
 * the lazy chunk loads. Routes without an element (layout routes) are
 * left as-is.
 */
function withSuspense(routes: readonly RouteObject[]): RouteObject[] {
  return routes.map((route) => ({
    ...route,
    element: route.element ? (
      <Suspense fallback={SuspenseFallback}>{route.element}</Suspense>
    ) : undefined,
  }));
}

/**
 * Build one router-level entry per installed app module. Each entry mounts
 * the module's routes under `/<id>/*` and wraps them in `<PillarGuard>` so
 * the subtree renders the `PillarUnavailableRoute` placeholder when the
 * owning pillar's health is `'unavailable'` (ADR-026 P3).
 *
 * `pillarIdForModule` currently maps every module to the platform `registry`
 * pillar; the guard is a no-op for healthy/unknown statuses. To route a
 * module's health at its own pillar, special-case its id in
 * `pillarIdForModule`.
 */
function appRouteEntries(manifests: readonly FrontendManifest[]): RouteObject[] {
  return filterAppManifests(manifests).map((manifest) => {
    const pillarId = pillarIdForModule(manifest.id);
    return {
      path: manifest.id,
      element: (
        <PillarGuard pillarId={pillarId}>
          <Outlet />
        </PillarGuard>
      ),
      children: withSuspense(manifest.frontend.routes),
    };
  });
}

const ErrorElement = (
  <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
    <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
    <p className="text-muted-foreground mb-6">An unexpected error occurred.</p>
    <Link
      to="/"
      className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 motion-safe:transition-colors"
    >
      Go home
    </Link>
  </div>
);

/**
 * Build the shell's browser router from the boot-resolved install set. Called
 * once from `App.tsx` after the boot snapshot resolves: the app routes derive
 * from `manifests`, the rest of the table (index redirect, legacy redirects,
 * settings/features, catch-all) is fixed.
 */
export function buildRouter(
  manifests: readonly FrontendManifest[]
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter([
    {
      path: '/',
      element: <RootLayout />,
      errorElement: ErrorElement,
      children: [
        { index: true, element: <IndexRedirect /> },
        ...appRouteEntries(manifests),
        // Legacy /cerebrum/admin/* redirects keep old bookmarks working now
        // that the admin surface lives under the top-level /ai/* and
        // /finance/* navs.
        { path: 'cerebrum/admin', element: <Navigate to="/ai" replace /> },
        { path: 'cerebrum/admin/prompts', element: <Navigate to="/finance/prompts" replace /> },
        { path: 'cerebrum/admin/rules', element: <Navigate to="/finance/rules" replace /> },
        { path: 'cerebrum/admin/cache', element: <Navigate to="/ai/cache" replace /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'features', element: <FeaturesPage /> },
        // Catch-all: if the first path segment names a buildable module
        // (`KNOWN_MODULES`) the operator excluded via `POPS_APPS`, render
        // NotInstalledPage. Genuinely unknown paths render NotFoundPage.
        // Both decisions happen inside `UnmatchedRoute` so the route table
        // stays free of inline module-id literals.
        { path: '*', element: <UnmatchedRoute /> },
      ],
    },
  ]);
}
