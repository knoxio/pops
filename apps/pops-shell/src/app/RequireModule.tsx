import { trpc } from '@/lib/trpc';
import { Outlet } from 'react-router';

import { NotInstalledPage } from './pages/NotInstalledPage';

import type { ReactNode } from 'react';

/**
 * Route-level guard that renders `NotInstalledPage` for any module whose id
 * isn't in this deployment's installed set (PRD-100). Manifest is fetched
 * once via `core.shell.manifest` and cached forever (`staleTime: Infinity`).
 *
 * Tradeoff (knowingly accepted for Tier 1):
 *  - Optimistic render while the manifest is in flight (or has errored).
 *    Children mount during that ~50-200ms window and may fire tRPC calls
 *    that the server-side `moduleGate` middleware will reject with
 *    NOT_FOUND if the module is absent.
 *  - Pessimistic alternative (a Loading… placeholder) breaks Playwright
 *    e2e tests that navigate immediately and look for elements before the
 *    manifest fetch completes.
 *  - Errored manifest fetch falls through to children rather than locking
 *    the user out — a transient `core.shell.manifest` failure shouldn't
 *    take down every domain route.
 */
export function RequireModule({
  moduleId,
  kind = 'app',
  children,
}: {
  moduleId: string;
  kind?: 'app' | 'overlay';
  children?: ReactNode;
}) {
  const { data } = trpc.core.shell.manifest.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (data) {
    const installed = kind === 'overlay' ? data.overlays : data.apps;
    if (!installed.includes(moduleId)) {
      return <NotInstalledPage />;
    }
  }

  return <>{children ?? <Outlet />}</>;
}
