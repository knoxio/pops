import { useTranslation } from 'react-i18next';

import { ErrorAlert, PageHeader } from '@pops/ui';

import { CacheActionsCard } from './cache-management/sections/CacheActionsCard';
import { CacheBreadcrumb } from './cache-management/sections/CacheBreadcrumb';
import { CacheStatsGrid } from './cache-management/sections/CacheStatsGrid';
import { useCacheManagementModel } from './cache-management/useCacheManagementModel';

/**
 * CacheManagementPage — view and manage the finance-categorizer AI entity
 * cache served by the FINANCE pillar (`/ai-usage/cache*`). Shows entry count
 * and on-disk size, plus controls to prune stale entries or clear the
 * whole cache. The cache surface re-homed from core to finance (gap #3489);
 * this AI-Ops admin page consumes it through the FE's finance client.
 */
export function CacheManagementPage() {
  const { t } = useTranslation('ai');
  const model = useCacheManagementModel();

  return (
    <div className="space-y-6">
      <CacheBreadcrumb />

      <PageHeader title={t('cache.title')} description={t('cache.description')} />

      {model.cacheError && (
        <ErrorAlert title={t('cache.failedToLoad')} message={model.cacheError.message} />
      )}

      <CacheStatsGrid
        isLoading={model.isLoading}
        totalEntries={model.totalEntries}
        diskSizeBytes={model.diskSizeBytes}
      />

      <CacheActionsCard
        staleDays={model.staleDays}
        onStaleDaysChange={model.setStaleDays}
        onClearStale={() => {
          model.clearStaleMutation.mutate({ maxAgeDays: model.staleDays });
        }}
        onClearAll={() => {
          model.clearAllMutation.mutate();
        }}
        totalEntries={model.totalEntries}
        clearStaleDisabled={model.clearStaleMutation.isPending || model.isEmpty}
        clearAllDisabled={model.clearAllMutation.isPending || model.isEmpty}
      />
    </div>
  );
}
