import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import {
  aiCacheCacheStats,
  aiCacheClearAllCache,
  aiCacheClearStaleCache,
} from '../../finance-api/index.js';

import type {
  AiCacheCacheStatsResponse,
  AiCacheClearAllCacheResponse,
  AiCacheClearStaleCacheResponse,
} from '../../finance-api/types.gen.js';

interface ClearStaleInput {
  maxAgeDays: number;
}

function useClearStaleMutation() {
  const queryClient = useQueryClient();
  return useMutation<AiCacheClearStaleCacheResponse, Error, ClearStaleInput>({
    mutationFn: async (body) => unwrap(await aiCacheClearStaleCache({ body })),
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'aiCache'] });
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });
}

function useClearAllMutation() {
  const queryClient = useQueryClient();
  return useMutation<AiCacheClearAllCacheResponse, Error, void>({
    mutationFn: async () => unwrap(await aiCacheClearAllCache()),
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'aiCache'] });
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
    isLoading,
    error: cacheError,
  } = useQuery<AiCacheCacheStatsResponse>({
    queryKey: ['finance', 'aiCache', 'cacheStats'],
    queryFn: async () => unwrap(await aiCacheCacheStats()),
  });

  const clearStaleMutation = useClearStaleMutation();
  const clearAllMutation = useClearAllMutation();

  const totalEntries = cacheStats?.totalEntries ?? 0;
  const diskSizeBytes = cacheStats?.diskSizeBytes ?? 0;

  return {
    staleDays,
    setStaleDays,
    cacheError,
    isLoading,
    isEmpty: totalEntries === 0,
    totalEntries,
    diskSizeBytes,
    clearStaleMutation,
    clearAllMutation,
  };
}

export type CacheManagementModel = ReturnType<typeof useCacheManagementModel>;
