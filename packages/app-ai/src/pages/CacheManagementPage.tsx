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
  const model = useCacheManagementModel();

  return (
    <div className="space-y-6">
      <CacheBreadcrumb />

      <PageHeader
        title="Cache Management"
        description="View and manage the AI entity categorisation cache"
      />

      {model.cacheError && (
        <Alert variant="destructive">
          <h3 className="font-semibold">Failed to load cache stats</h3>
          <p className="text-sm mt-1">{model.cacheError.message}</p>
        </Alert>
      )}

      <CacheStatsGrid
        isLoading={model.isLoading}
        totalEntries={model.totalEntries}
        diskSizeBytes={model.diskSizeBytes}
        totalCacheHits={model.totalCacheHits}
        hitRatePct={model.hitRatePct}
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
