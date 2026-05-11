/**
 * Cross-module route extensions composed by the shell (PRD-097 forbids
 * `@pops/app-*` → `@pops/app-*` imports, so this composition can't live
 * inside `@pops/app-cerebrum`).
 *
 * Today the only extension is `/cerebrum/admin/*` — surfaced from
 * `@pops/app-ai` (issue #2333 merged the former top-level `/ai/*` route
 * into a sub-route of cerebrum). When the AI module is not installed the
 * extension is silently skipped.
 *
 * Keyed by the host module id so the router can apply extensions without
 * enumerating module ids inline.
 */
import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { routes as aiAdminRoutes } from '@pops/app-ai';
import { isModuleId } from '@pops/module-registry';

import type { RouteObject } from 'react-router';

const SuspenseFallback = (
  <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
);

const CEREBRUM_ID = 'cerebrum';
const AI_ID = 'ai';

/**
 * Additional react-router children to inject under a given module's
 * top-level route. Returns an empty array when the host module has no
 * extensions or when the donor module isn't installed.
 *
 * The `@pops/app-ai` import above is a hard workspace dependency, so the
 * module is always resolvable. The `isModuleId` check is a runtime test
 * against the `MODULES` constant — which is itself generated at build time
 * from `POPS_APPS` / `POPS_OVERLAYS` — so when the AI module is excluded
 * from the install set, `isModuleId('ai')` returns `false` and the
 * `aiAdminRoutes` reference is never reached. Vite's production build
 * tree-shakes the unused `aiAdminRoutes` import in that case, so the dead
 * routes don't ship in the bundle.
 */
export function extensionsFor(hostModuleId: string): readonly RouteObject[] {
  if (hostModuleId !== CEREBRUM_ID) return [];
  if (!isModuleId(AI_ID)) return [];
  return [
    {
      path: 'admin',
      element: (
        <Suspense fallback={SuspenseFallback}>
          <Outlet />
        </Suspense>
      ),
      children: aiAdminRoutes,
    },
  ];
}
