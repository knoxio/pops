import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

interface UseArenaBlacklistArgs {
  resolveTitle: (mediaId: number) => string;
  onAfterAction: () => void;
}

interface ComparisonsListResult {
  pagination?: { total: number };
}

interface BlacklistInput {
  mediaType: 'movie';
  mediaId: number;
}

/**
 * Manages the "Mark as not watched" (blacklist) confirmation flow:
 * the target movie, comparison-count lookup, and the destructive mutation.
 */
export function useArenaBlacklist({ resolveTitle, onAfterAction }: UseArenaBlacklistArgs) {
  const utils = usePillarUtils('media');
  const [target, setTarget] = useState<{ id: number; title: string } | null>(null);

  const { data: blacklistComparisonData } = usePillarQuery<ComparisonsListResult>(
    'media',
    ['comparisons', 'listForMedia'],
    { mediaType: 'movie', mediaId: target?.id ?? 0, limit: 1 },
    { enabled: target !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = usePillarMutation<BlacklistInput, unknown>(
    'media',
    ['comparisons', 'blacklistMovie'],
    {
      onSuccess: (_data, variables) => {
        toast.success(`${resolveTitle(variables.mediaId)} marked as not watched`);
        setTarget(null);
        onAfterAction();
        void utils.invalidate(['comparisons', 'getSmartPair']);
      },
    }
  );

  const open = useCallback((movie: { id: number; title: string }) => {
    setTarget(movie);
  }, []);

  const cancel = useCallback(() => setTarget(null), []);

  const confirm = useCallback(() => {
    if (!target) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: target.id });
  }, [target, blacklistMutation]);

  return {
    target,
    comparisonsToPurge,
    isPending: blacklistMutation.isPending,
    open,
    cancel,
    confirm,
  };
}
