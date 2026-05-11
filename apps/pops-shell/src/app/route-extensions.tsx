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
 * The donor-installed check uses the build-time `isModuleId` guard so
 * the type narrows automatically when `POPS_APPS` excludes the donor.
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
