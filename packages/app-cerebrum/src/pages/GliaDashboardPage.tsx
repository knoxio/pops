/**
 * GliaDashboardPage — `/cerebrum/glia` (PRD-085, PRD-086).
 *
 * Sibling of the existing `/cerebrum/proposals` page. Composes three
 * panels: worker run-once triggers, trust state summary, and the full
 * audit trail of every Glia action. The proposal queue remains its
 * own page for now; this dashboard intentionally focuses on the
 * post-graduation/operational view.
 */
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { AuditTrailPanel } from './glia-dashboard/AuditTrailPanel';
import { TrustStatePanel } from './glia-dashboard/TrustStatePanel';
import { WorkerPanel } from './glia-dashboard/WorkerPanel';

export function GliaDashboardPage() {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader title={t('glia.title')} description={t('glia.description')} />
      <WorkerPanel />
      <TrustStatePanel />
      <AuditTrailPanel />
    </div>
  );
}
