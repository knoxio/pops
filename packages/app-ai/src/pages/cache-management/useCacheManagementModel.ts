import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

type UsageStats = {
  totalApiCalls?: number;
  totalCacheHits?: number;
  cacheHitRate?: number;
};

type CacheStats = {
  totalEntries?: number;
  diskSizeBytes?: number;
};

function deriveDisplayMetrics(usage: UsageStats | undefined, cache: CacheStats | undefined) {
  const totalCacheHits = usage?.totalCacheHits ?? 0;
  const totalRequests = (usage?.totalApiCalls ?? 0) + totalCacheHits;
  const hitRateDisplay =
    totalRequests > 0 ? `${((usage?.cacheHitRate ?? 0) * 100).toFixed(1)}%` : '—';
  const totalEntries = cache?.totalEntries ?? 0;
  const diskSizeBytes = cache?.diskSizeBytes ?? 0;
  return { totalCacheHits, hitRateDisplay, totalEntries, diskSizeBytes };
}

function useClearStaleMutation() {
  const utils = trpc.useUtils();
  return trpc.core.aiUsage.clearStaleCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });
}

function useClearAllMutation() {
  const utils = trpc.useUtils();
  return trpc.core.aiUsage.clearAllCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear cache');
    },
  });
}

export function useCacheManagementModel() {
  const [staleDays, setStaleDays] = useState(30);

  const {
    data: cacheStats,
    isLoading: cacheLoading,
    error: cacheError,
  } = trpc.core.aiUsage.cacheStats.useQuery();
  const { data: usageStats, isLoading: usageLoading } = trpc.core.aiUsage.getStats.useQuery();

  const clearStaleMutation = useClearStaleMutation();
  const clearAllMutation = useClearAllMutation();

  const metrics = deriveDisplayMetrics(usageStats, cacheStats);

  return {
    staleDays,
    setStaleDays,
    cacheError,
    isLoading: cacheLoading || usageLoading,
    isEmpty: metrics.totalEntries === 0,
    ...metrics,
    clearStaleMutation,
    clearAllMutation,
  };
}

export type CacheManagementModel = ReturnType<typeof useCacheManagementModel>;
