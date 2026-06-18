import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../core-api-helpers.js';
import {
  aiUsageCacheStats,
  aiUsageClearAllCache,
  aiUsageClearStaleCache,
  aiUsageGetStats,
} from '../../core-api/index.js';

import type {
  AiUsageCacheStatsResponse,
  AiUsageClearAllCacheResponse,
  AiUsageClearStaleCacheResponse,
  AiUsageGetStatsResponse,
} from '../../core-api/types.gen.js';

interface ClearStaleInput {
  maxAgeDays: number;
}

function deriveDisplayMetrics(
  usage: AiUsageGetStatsResponse | undefined,
  cache: AiUsageCacheStatsResponse | undefined
) {
  const totalCacheHits = usage?.totalCacheHits ?? 0;
  const totalRequests = (usage?.totalApiCalls ?? 0) + totalCacheHits;
  const hitRateDisplay =
    totalRequests > 0 ? `${((usage?.cacheHitRate ?? 0) * 100).toFixed(1)}%` : '—';
  const totalEntries = cache?.totalEntries ?? 0;
  const diskSizeBytes = cache?.diskSizeBytes ?? 0;
  return { totalCacheHits, hitRateDisplay, totalEntries, diskSizeBytes };
}

function useClearStaleMutation() {
  const queryClient = useQueryClient();
  return useMutation<AiUsageClearStaleCacheResponse, Error, ClearStaleInput>({
    mutationFn: async (body) => unwrap(await aiUsageClearStaleCache({ body })),
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void queryClient.invalidateQueries({ queryKey: ['core', 'aiUsage'] });
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });
}

function useClearAllMutation() {
  const queryClient = useQueryClient();
  return useMutation<AiUsageClearAllCacheResponse, Error, void>({
    mutationFn: async () => unwrap(await aiUsageClearAllCache()),
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void queryClient.invalidateQueries({ queryKey: ['core', 'aiUsage'] });
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
  } = useQuery<AiUsageCacheStatsResponse>({
    queryKey: ['core', 'aiUsage', 'cacheStats'],
    queryFn: async () => unwrap(await aiUsageCacheStats()),
  });
  const { data: usageStats, isLoading: usageLoading } = useQuery<AiUsageGetStatsResponse>({
    queryKey: ['core', 'aiUsage', 'getStats'],
    queryFn: async () => unwrap(await aiUsageGetStats()),
  });

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
