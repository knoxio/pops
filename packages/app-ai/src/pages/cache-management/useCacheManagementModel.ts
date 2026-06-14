import { useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

interface UsageStats {
  totalApiCalls?: number;
  totalCacheHits?: number;
  cacheHitRate?: number;
}

interface CacheStats {
  totalEntries?: number;
  diskSizeBytes?: number;
}

interface ClearResult {
  removed: number;
}

interface ClearStaleInput {
  maxAgeDays: number;
}

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
  const utils = usePillarUtils('core');
  return usePillarMutation<ClearStaleInput, ClearResult>('core', ['aiUsage', 'clearStaleCache'], {
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void utils.invalidate(['aiUsage', 'cacheStats']);
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });
}

function useClearAllMutation() {
  const utils = usePillarUtils('core');
  return usePillarMutation<void, ClearResult>('core', ['aiUsage', 'clearAllCache'], {
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void utils.invalidate(['aiUsage', 'cacheStats']);
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
  } = usePillarQuery<CacheStats>('core', ['aiUsage', 'cacheStats'], undefined);
  const { data: usageStats, isLoading: usageLoading } = usePillarQuery<UsageStats>(
    'core',
    ['aiUsage', 'getStats'],
    undefined
  );

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
