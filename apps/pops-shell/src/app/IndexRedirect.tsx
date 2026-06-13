import { Navigate } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

/**
 * `/` redirect that respects the installed-modules manifest (PRD-100).
 * Picks the first installed app in `APP_ORDER`; falls back to `/settings`
 * if no apps are installed (which means `core` is the only operational
 * surface).
 *
 * Default deployments (POPS_APPS unset → all installed) land on `/finance`
 * just like before.
 */
const APP_ORDER = ['finance', 'media', 'inventory', 'cerebrum'] as const;

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

  const target = APP_ORDER.find((id) => data.apps.includes(id));
  return <Navigate to={target ? `/${target}` : '/settings'} replace />;
}
