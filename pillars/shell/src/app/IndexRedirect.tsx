import { shellManifest } from '@/registry-api';
import { unwrap } from '@/registry-api-helpers';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';

import { useRegisteredApps } from './BootRegistryProvider';

/**
 * `/` redirect that respects the installed-modules manifest (PRD-100).
 * Picks the first installed app from the LIVE `registeredApps` (manifest
 * `nav.order` ascending, lexicographic tiebreak — see `nav/registry.ts`);
 * falls back to `/settings` if no apps are installed.
 *
 * The landing target is derived from the boot-resolved install set, never a
 * `/finance` literal: on a finance-less registry the first live app is the
 * correct destination, and hardcoding `/finance` there would flash the
 * router's NotInstalledPage. Default deployments (POPS_APPS unset → all
 * installed) still land on `/finance` because finance carries the lowest
 * `nav.order` (10) in the workspace bundle map, so it sorts first.
 */
export function IndexRedirect() {
  const registeredApps = useRegisteredApps();
  const { data } = useQuery({
    queryKey: ['core', 'shell', 'manifest'],
    queryFn: async () => unwrap(await shellManifest()),
    staleTime: Infinity,
  });

  // The first live app (lowest nav.order) is the always-valid optimistic
  // default: it is guaranteed to be in the install set the router mounted, so
  // navigating to it never hits NotInstalledPage. `/settings` only when the
  // live rail is empty (no apps installed at all).
  const firstLiveApp = registeredApps[0];
  const fallbackTarget = firstLiveApp ? `/${firstLiveApp.id}` : '/settings';

  // Manifest hasn't loaded yet, the pillar is unreachable, or the contract
  // shape has drifted — `data` is undefined on any of those (the query errors
  // on a failed fetch). Optimistically pick the first live app so the URL
  // change is instant and always lands on a mounted route.
  if (!data) {
    return <Navigate to={fallbackTarget} replace />;
  }

  // `data.apps` is the operator's build-time install selection (POPS_APPS).
  // When none of the live rail apps appear in it, settings is the only safe
  // landing — the live default may be an app the operator excluded.
  const target = registeredApps.find((app) => data.apps.includes(app.id));
  return <Navigate to={target ? `/${target.id}` : '/settings'} replace />;
}
