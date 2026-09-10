import { useTranslation } from 'react-i18next';

import { PendingImportList } from '../../components/imports/pending/PendingImportList';
import { usePendingImports } from '../../components/imports/pending/usePendingImports';

/** The dashboard shows this many cards and counts the rest. */
export const DASHBOARD_PENDING_CAP = 5;

/**
 * Every pending import as its own card, between the stat tiles and the
 * recent transactions (experiment `pending-imports-entry`, chosen `cards`).
 * Absent entirely when nothing is pending: a dashboard that says "nothing
 * to continue" every day is one nobody reads.
 */
export function PendingImports() {
  const { t } = useTranslation('finance');
  const { items } = usePendingImports();
  if (items === undefined || items.length === 0) return null;
  return (
    <section className="space-y-4" aria-labelledby="pending-imports-heading">
      <div className="flex items-center justify-between">
        <h2 id="pending-imports-heading" className="text-xl font-semibold tracking-tight">
          {t('dashboard.pendingImports')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('import.pending.dashboardHint', { count: items.length })}
        </p>
      </div>
      <PendingImportList items={items} max={DASHBOARD_PENDING_CAP} />
    </section>
  );
}
