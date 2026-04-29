import { useTranslation } from 'react-i18next';

import { Alert, PageHeader } from '@pops/ui';

/**
 * CacheManagementPage — View and manage the AI entity cache.
 *
 * Shows cache stats (total entries, disk size, hit rate) and provides
 * controls to clear stale or all cache entries. PRD-053/US-03.
 */
import { CacheActionsCard } from './cache-management/sections/CacheActionsCard';
import { CacheBreadcrumb } from './cache-management/sections/CacheBreadcrumb';
import { CacheStatsGrid } from './cache-management/sections/CacheStatsGrid';
import { useCacheManagementModel } from './cache-management/useCacheManagementModel';

export function CacheManagementPage() {
  const { t } = useTranslation('ai');
  const model = useCacheManagementModel();

  return (
    <div className="space-y-6">
      <CacheBreadcrumb />

      <PageHeader title={t('cache.title')} description={t('cache.description')} />

      {model.cacheError && (
        <Alert variant="destructive">
          <h3 className="font-semibold">{t('cache.failedToLoad')}</h3>
          <p className="text-sm mt-1">{model.cacheError.message}</p>
        </Alert>
      )}

      <CacheStatsGrid
        isLoading={model.isLoading}
        totalEntries={model.totalEntries}
        diskSizeBytes={model.diskSizeBytes}
        totalCacheHits={model.totalCacheHits}
        hitRateDisplay={model.hitRateDisplay}
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
