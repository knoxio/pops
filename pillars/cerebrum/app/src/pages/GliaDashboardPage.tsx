/**
 * GliaDashboardPage — `/cerebrum/glia`.
 *
 * Composes three panels: worker run-once triggers, trust state summary,
 * and the audit trail of every Glia action. The proposal queue is its
 * own page; this dashboard focuses on the operational view.
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
