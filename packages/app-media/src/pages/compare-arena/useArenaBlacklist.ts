import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseArenaBlacklistArgs {
  resolveTitle: (mediaId: number) => string;
  onAfterAction: () => void;
}

/**
 * Manages the "Mark as not watched" (blacklist) confirmation flow:
 * the target movie, comparison-count lookup, and the destructive mutation.
 */
export function useArenaBlacklist({ resolveTitle, onAfterAction }: UseArenaBlacklistArgs) {
  const utils = trpc.useUtils();
  const [target, setTarget] = useState<{ id: number; title: string } | null>(null);

  const { data: blacklistComparisonData } = trpc.media.comparisons.listForMedia.useQuery(
    { mediaType: 'movie', mediaId: target?.id ?? 0, limit: 1 },
    { enabled: target !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${resolveTitle(variables.mediaId)} marked as not watched`);
      setTarget(null);
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

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
