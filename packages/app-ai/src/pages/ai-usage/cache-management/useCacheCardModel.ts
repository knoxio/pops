import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

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

export function useCacheCardModel() {
  const [staleDays, setStaleDays] = useState(30);
  const { data: cacheStats, isLoading } = trpc.core.aiUsage.cacheStats.useQuery();
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
