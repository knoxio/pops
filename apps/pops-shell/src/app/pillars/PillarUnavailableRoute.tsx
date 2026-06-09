/**
 * Placeholder rendered when a route's owning pillar is unavailable
 * (ADR-026 P3).
 *
 * Distinct from `NotInstalledPage` (module excluded from this build) and
 * `NotFoundPage` (unknown URL). This page fires when the module IS
 * installed but its backend pillar is unreachable — typically because
 * the pillar's container is restarting or its health check is failing.
 *
 * The retry button calls `refresh()` on the boot context, which re-runs
 * `GET /pillars/health` against core-api. No global page reload — the
 * shell and the working pillars stay mounted.
 */
import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { usePillarStatusContext } from './usePillarStatus';

interface PillarUnavailableRouteProps {
  /** The id of the pillar that is unavailable (e.g. `'food'`). */
  readonly pillarId: string;
}

export function PillarUnavailableRoute({
  pillarId,
}: PillarUnavailableRouteProps): React.ReactElement {
  const { t } = useTranslation('shell');
  const { refresh, loading } = usePillarStatusContext();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <CloudOff className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">{t('pillarUnavailableTitle')}</h1>
      <p className="text-muted-foreground mb-6 max-w-prose">
        {t('pillarUnavailableDescription', { pillar: pillarId })}
      </p>
      <Button
        onClick={() => {
          void refresh();
        }}
        disabled={loading}
      >
        {loading ? t('pillarUnavailableRetrying') : t('pillarUnavailableRetry')}
      </Button>
    </div>
  );
}
