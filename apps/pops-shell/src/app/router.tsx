/**
 * Shell router configuration
 *
 * RootLayout provides the top bar + sidebar chrome.
 * Finance routes are lazily loaded from @pops/app-finance.
 */
import { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { routes as financeRoutes } from "@pops/app-finance";
import { routes as mediaRoutes } from "@pops/app-media";
import { RootLayout } from "./layout/RootLayout";

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
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/finance" replace /> },
      {
        path: "finance",
        children: withSuspense(financeRoutes),
      },
      {
        path: "media",
        children: withSuspense(mediaRoutes),
      },
    ],
  },
]);
