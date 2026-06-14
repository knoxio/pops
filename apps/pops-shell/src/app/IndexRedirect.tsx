import { Navigate } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { registeredApps } from './nav/registry';

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
type ShellManifest = {
  apps: readonly string[];
  overlays: readonly string[];
};

export function IndexRedirect() {
  const { data, isUnavailable, isContractMismatch } = usePillarQuery<ShellManifest>(
    'core',
    ['shell', 'manifest'],
    undefined,
    { staleTime: Infinity }
  );

  // Manifest hasn't loaded yet, the pillar is unreachable, or the contract
  // shape has drifted — optimistically pick the historical default so the
  // URL change is instant. The router's catch-all (`UnmatchedRoute`) will
  // flip to NotInstalledPage if finance turns out to be absent.
  if (!data || isUnavailable || isContractMismatch) {
    return <Navigate to="/finance" replace />;
  }

  const target = registeredApps.find((app) => data.apps.includes(app.id));
  return <Navigate to={target ? `/${target.id}` : '/settings'} replace />;
}
