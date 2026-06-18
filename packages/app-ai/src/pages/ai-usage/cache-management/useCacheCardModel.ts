import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../core-api-helpers.js';
import {
  aiUsageCacheStats,
  aiUsageClearAllCache,
  aiUsageClearStaleCache,
} from '../../../core-api/index.js';

import type {
  AiUsageCacheStatsResponse,
  AiUsageClearAllCacheResponse,
  AiUsageClearStaleCacheResponse,
} from '../../../core-api/types.gen.js';

interface ClearStaleInput {
  maxAgeDays: number;
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

export function useCacheCardModel() {
  const [staleDays, setStaleDays] = useState(30);
  const { data: cacheStats, isLoading } = useQuery<AiUsageCacheStatsResponse>({
    queryKey: ['core', 'aiUsage', 'cacheStats'],
    queryFn: async () => unwrap(await aiUsageCacheStats()),
  });
  const clearStaleMutation = useClearStaleMutation();
  const clearAllMutation = useClearAllMutation();

  return {
    staleDays,
    setStaleDays,
    cacheStats,
    isLoading,
    clearStaleMutation,
    clearAllMutation,
  };
}
