import { shellManifest } from '@/core-api';
import { unwrap } from '@/core-api-helpers';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';

import { useRegisteredApps } from './BootRegistryProvider';

/**
 * `/` redirect that respects the installed-modules manifest (PRD-100).
 * Picks the first installed app from `registeredApps` (manifest `nav.order`
 * ascending, lexicographic tiebreak — see `nav/registry.ts`); falls back
 * to `/settings` if no apps are installed.
 *
 * Default deployments (POPS_APPS unset → all installed) land on `/finance`
 * because finance carries the lowest `nav.order` (10) in the workspace
 * bundle map.
 */
export function IndexRedirect() {
  const registeredApps = useRegisteredApps();
  const { data } = useQuery({
    queryKey: ['core', 'shell', 'manifest'],
    queryFn: async () => unwrap(await shellManifest()),
    staleTime: Infinity,
  });

  // Manifest hasn't loaded yet, the pillar is unreachable, or the contract
  // shape has drifted — `data` is undefined on any of those (the query errors
  // on a failed fetch). Optimistically pick the historical default so the URL
  // change is instant. The router's catch-all (`UnmatchedRoute`) will flip to
  // NotInstalledPage if finance turns out to be absent.
  if (!data) {
    return <Navigate to="/finance" replace />;
  }

  const target = registeredApps.find((app) => data.apps.includes(app.id));
  return <Navigate to={target ? `/${target.id}` : '/settings'} replace />;
}
