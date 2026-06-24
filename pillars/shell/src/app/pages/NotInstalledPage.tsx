import { PackageOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { Button } from '@pops/ui';

/**
 * Fallback for routes whose owning module isn't in the deployment's
 * `POPS_APPS` / `POPS_OVERLAYS` set. Distinct from 404 — the URL's first
 * segment names a known module id, the module just isn't installed in this
 * build. Rendered by the router's catch-all `UnmatchedRoute`, which only
 * picks this over `NotFoundPage` when the leading segment is in
 * `KNOWN_MODULES` but absent from the live install set.
 *
 * See pillars/shell/docs/prds/shell.
 */
export function NotInstalledPage() {
  const { pathname } = useLocation();
  // First non-empty path segment is the requested module id; the component
  // derives it from the pathname directly (the catch-all binds no route param).
  const moduleId = pathname.split('/').find((s) => s.length > 0) ?? '';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <PackageOpen className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">Module not installed</h1>
      <p className="text-muted-foreground mb-6 max-w-prose">
        The page at <code className="font-mono">{pathname}</code> belongs to the{' '}
        {moduleId ? <code className="font-mono">{moduleId}</code> : <span>requested</span>} module,
        which is not installed in this deployment. The install set is fixed at build time —
        page-routed apps come from <code>POPS_APPS</code> and overlay modules (e.g.{' '}
        <code className="font-mono">ego</code>) from <code>POPS_OVERLAYS</code>. Update the relevant
        env var, then rebuild and redeploy the shell to enable this module; restarting the running
        server is not sufficient.
      </p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
