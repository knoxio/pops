/**
 * Shell router configuration
 *
 * RootLayout provides the top bar + sidebar chrome.
 * Finance routes are lazily loaded from @pops/app-finance.
 */
import { routes as aiRoutes } from '@pops/app-ai';
import { routes as financeRoutes } from '@pops/app-finance';
import { routes as inventoryRoutes } from '@pops/app-inventory';
import { routes as mediaRoutes } from '@pops/app-media';
import { Suspense } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router';

import { RootLayout } from './layout/RootLayout';
import { NotFoundPage } from './pages/NotFoundPage';

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
      { index: true, element: <Navigate to="/finance" replace /> },
      {
        path: 'finance',
        children: withSuspense(financeRoutes),
      },
      {
        path: 'media',
        children: withSuspense(mediaRoutes),
      },
      {
        path: 'inventory',
        children: withSuspense(inventoryRoutes),
      },
      {
        path: 'ai',
        children: withSuspense(aiRoutes),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
