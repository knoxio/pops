import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';
import { PageHeader } from '@pops/ui';

import { CollapsibleSection, ExpiringSection } from './warranties-page/sections';
import { EmptyState, ErrorState, WarrantySkeleton } from './warranties-page/states';
import { categorizeWarranties, type WarrantyTiers } from './warranties-page/utils';
import { WarrantyRow } from './warranties-page/WarrantyRow';

interface WarrantyContentProps {
  tiers: WarrantyTiers;
  paperlessBaseUrl: string | null;
  onItemClick: (id: string) => void;
}

function WarrantyContent({ tiers, paperlessBaseUrl, onItemClick }: WarrantyContentProps) {
  const { t } = useTranslation('inventory');
  const { critical, warning, caution, active, expired } = tiers;
  const hasExpiringItems = critical.length + warning.length + caution.length > 0;

  return (
    <div className="space-y-4">
      <ExpiringSection
        tier="critical"
        items={critical}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      <ExpiringSection
        tier="warning"
        items={warning}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      <ExpiringSection
        tier="caution"
        items={caution}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      {active.length > 0 && (
        <CollapsibleSection title={t('section.active')} count={active.length} defaultOpen>
          {active.map((item) => (
            <WarrantyRow
              key={item.id}
              item={item}
              daysRemaining={item.daysRemaining}
              paperlessBaseUrl={paperlessBaseUrl}
              onClick={() => onItemClick(item.id)}
            />
          ))}
        </CollapsibleSection>
      )}
      {expired.length > 0 && (
        <CollapsibleSection
          title={t('section.expired')}
          count={expired.length}
          defaultOpen={!hasExpiringItems && active.length === 0}
        >
          {expired.map((item) => (
            <WarrantyRow
              key={item.id}
              item={item}
              daysRemaining={item.daysRemaining}
              paperlessBaseUrl={paperlessBaseUrl}
              onClick={() => onItemClick(item.id)}
            />
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}

function WarrantiesBody({
  isLoading,
  isError,
  tiers,
  paperlessBaseUrl,
  onRetry,
  onItemClick,
}: {
  isLoading: boolean;
  isError: boolean;
  tiers: WarrantyTiers;
  paperlessBaseUrl: string | null;
  onRetry: () => void;
  onItemClick: (id: string) => void;
}) {
  if (isLoading) return <WarrantySkeleton />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  const totalItems =
    tiers.critical.length +
    tiers.warning.length +
    tiers.caution.length +
    tiers.active.length +
    tiers.expired.length;
  if (totalItems === 0) return <EmptyState />;
  return (
    <WarrantyContent tiers={tiers} paperlessBaseUrl={paperlessBaseUrl} onItemClick={onItemClick} />
  );
}

export function WarrantiesPage() {
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = trpc.inventory.reports.warranties.useQuery();
  const { data: paperlessData } = trpc.inventory.paperless.status.useQuery();
  const paperlessBaseUrl = paperlessData?.data?.available ? paperlessData.data.baseUrl : null;
  const tiers = useMemo(() => categorizeWarranties(data?.data ?? []), [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('section.warrantyTracking')}
        icon={
          <div className="p-2 rounded-xl bg-app-accent/10">
            <ShieldCheck className="h-6 w-6 text-app-accent" />
          </div>
        }
      />
      <WarrantiesBody
        isLoading={isLoading}
        isError={isError}
        tiers={tiers}
        paperlessBaseUrl={paperlessBaseUrl}
        onRetry={() => refetch()}
        onItemClick={(id) => navigate(`/inventory/items/${id}`)}
      />
    </div>
  );
}
