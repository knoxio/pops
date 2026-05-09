import { Suspense } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router';

/**
 * Shell router configuration
 *
 * RootLayout provides the top bar + sidebar chrome.
 * Finance routes are lazily loaded from @pops/app-finance.
 *
 * The former /ai top-level route has been merged into /cerebrum/admin/*
 * (see issue #2333). Legacy /ai/* URLs redirect to /cerebrum/admin/*.
 */
import { routes as cerebrumRoutes } from '@pops/app-cerebrum';
import { routes as financeRoutes } from '@pops/app-finance';
import { routes as inventoryRoutes } from '@pops/app-inventory';
import { routes as mediaRoutes } from '@pops/app-media';

import { IndexRedirect } from './IndexRedirect';
import { RootLayout } from './layout/RootLayout';
import { FeaturesPage } from './pages/features-page/FeaturesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { RequireModule } from './RequireModule';

/**
 * Wrap lazy-loaded routes with Suspense so React can show a fallback
 * while the chunk loads.
 */
const withSuspense = (routes: typeof financeRoutes) =>
  routes.map((route) => ({
    ...route,
    element: route.element ? (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Loading…
          </div>
        }
      >
        {route.element}
      </Suspense>
    ) : undefined,
  }));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">An unexpected error occurred.</p>
        <Link
          to="/"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    ),
    children: [
      { index: true, element: <IndexRedirect /> },
      {
        path: 'finance',
        element: <RequireModule moduleId="finance" />,
        children: withSuspense(financeRoutes),
      },
      {
        path: 'media',
        element: <RequireModule moduleId="media" />,
        children: withSuspense(mediaRoutes),
      },
      {
        path: 'inventory',
        element: <RequireModule moduleId="inventory" />,
        children: withSuspense(inventoryRoutes),
      },
      {
        path: 'cerebrum',
        element: <RequireModule moduleId="cerebrum" />,
        children: withSuspense(cerebrumRoutes),
      },
      // Legacy /ai/* redirects — keep bookmarks and deep-links working.
      { path: 'ai', element: <Navigate to="/cerebrum" replace /> },
      { path: 'ai/prompts', element: <Navigate to="/cerebrum/admin/prompts" replace /> },
      { path: 'ai/config', element: <Navigate to="/settings#ai.config" replace /> },
      { path: 'ai/rules', element: <Navigate to="/cerebrum/admin/rules" replace /> },
      { path: 'ai/cache', element: <Navigate to="/cerebrum/admin/cache" replace /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'features', element: <FeaturesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
