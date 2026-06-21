import { Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

export function ConnectionsPage() {
  const { t } = useTranslation('inventory');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('connections')}
        icon={
          <div className="p-2 rounded-xl bg-app-accent/10">
            <Network className="h-6 w-6 text-app-accent" />
          </div>
        }
      />
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h1 role="heading" className="text-xl font-semibold text-foreground mb-2">
          {t('connections')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('connections.comingSoon')}</p>
      </div>
    </div>
  );
}
