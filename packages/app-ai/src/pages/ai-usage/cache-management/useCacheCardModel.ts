import { useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

interface CacheStats {
  totalEntries: number;
  diskSizeBytes: number;
}

interface ClearResult {
  removed: number;
}

interface ClearStaleInput {
  maxAgeDays: number;
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

export function useCacheCardModel() {
  const [staleDays, setStaleDays] = useState(30);
  const { data: cacheStats, isLoading } = usePillarQuery<CacheStats>(
    'core',
    ['aiUsage', 'cacheStats'],
    undefined
  );
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
