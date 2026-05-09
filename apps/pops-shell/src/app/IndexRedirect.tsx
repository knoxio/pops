import { trpc } from '@/lib/trpc';
import { Navigate } from 'react-router';

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

export function IndexRedirect() {
  const { data } = trpc.core.shell.manifest.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Manifest hasn't loaded yet — optimistically pick the historical default
  // so the URL change is instant. RequireModule will flip to NotInstalledPage
  // after the manifest arrives if finance is actually absent.
  if (!data) return <Navigate to="/finance" replace />;

  const target = APP_ORDER.find((id) => data.apps.includes(id));
  return <Navigate to={target ? `/${target}` : '/settings'} replace />;
}
