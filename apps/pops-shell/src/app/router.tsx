/**
 * Shell route table — composed from the build-time module registry
 * (`@pops/module-registry` → `installedAppManifests()`).
 *
 * PRD-101 US-03 removes the per-module hand-coded `<Route>` list from this
 * file: route entries derive from the install set, the runtime
 * `RequireModule` guard is gone, and direct navigation to an absent
 * module's URL renders `NotInstalledPage` via the catch-all.
 *
 * Cross-module composition (e.g. `/cerebrum/admin/*` surfacing AI admin
 * pages from `@pops/app-ai`) lives in `./route-extensions` so this file
 * stays free of inline module-id literals.
 */
import { Suspense } from 'react';
import { createBrowserRouter, Link, Navigate, useLocation } from 'react-router';

import { KNOWN_MODULES } from '@pops/module-registry';

import { IndexRedirect } from './IndexRedirect';
import { installedAppManifests } from './installed-modules';
import { RootLayout } from './layout/RootLayout';
import { FeaturesPage } from './pages/features-page/FeaturesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotInstalledPage } from './pages/NotInstalledPage';
import { SettingsPage } from './pages/SettingsPage';
import { extensionsFor } from './route-extensions';

import type { RouteObject } from 'react-router';

/**
 * Catch-all element: if the URL's first path segment names a known
 * buildable module (`KNOWN_MODULES`) that isn't installed in this build,
 * render `NotInstalledPage`. Otherwise fall through to `NotFoundPage`.
 *
 * Using the full `KNOWN_MODULES` set (rather than just `MODULES`) here
 * means the "not installed" message fires for any module the codebase
 * could ship — including ones excluded by `POPS_APPS` — while truly
 * unknown paths still get a proper 404.
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
 * the module's routes under `/<id>/*` plus any cross-module extensions
 * declared in `./route-extensions`.
 */
function appRouteEntries(): RouteObject[] {
  return installedAppManifests().map((manifest) => ({
    path: manifest.id,
    children: [...withSuspense(manifest.frontend.routes), ...extensionsFor(manifest.id)],
  }));
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: ErrorElement,
    children: [
      { index: true, element: <IndexRedirect /> },
      ...appRouteEntries(),
      // Legacy /ai/* redirects — keep bookmarks and deep-links working
      // after the AI app merged into /cerebrum/admin (#2333).
      { path: 'ai', element: <Navigate to="/cerebrum" replace /> },
      { path: 'ai/prompts', element: <Navigate to="/cerebrum/admin/prompts" replace /> },
      { path: 'ai/config', element: <Navigate to="/settings#ai.config" replace /> },
      { path: 'ai/rules', element: <Navigate to="/cerebrum/admin/rules" replace /> },
      { path: 'ai/cache', element: <Navigate to="/cerebrum/admin/cache" replace /> },
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
