import { PackageOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { Button } from '@pops/ui';

/**
 * Fallback for routes whose owning module isn't in the deployment's
 * `POPS_APPS` / `POPS_OVERLAYS` set (PRD-100). Distinct from 404 — the
 * route exists, the module just isn't installed.
 */
export function NotInstalledPage() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <PackageOpen className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">Module not installed</h1>
      <p className="text-muted-foreground mb-6 max-w-prose">
        The page at <code className="font-mono">{pathname}</code> belongs to a module that is not
        installed in this deployment. Update <code>POPS_APPS</code> in your environment and restart
        the server to enable it.
      </p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
