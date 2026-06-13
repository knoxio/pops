import { useCallback } from 'react';
import { toast } from 'sonner';

import { usePillarMutation } from '@pops/pillar-sdk/react';

import type { MediaUtils } from './useScoreDelta';

interface MarkStaleInput {
  mediaType: 'movie';
  mediaId: number;
}

interface MarkStaleResult {
  data: { staleness: number };
}

interface ExcludeInput {
  mediaType: 'movie';
  mediaId: number;
  dimensionId: number;
}

interface Args {
  dimensionId: number | null;
  utils: MediaUtils;
  resolveTitle: (id: number) => string;
  onAfterAction: () => void;
}

export function useStaleAndExcludeMutations({
  dimensionId,
  utils,
  resolveTitle,
  onAfterAction,
}: Args) {
  const markStaleMutation = usePillarMutation<MarkStaleInput, MarkStaleResult>(
    'media',
    ['comparisons', 'markStale'],
    {
      onSuccess: (data, variables) => {
        const staleness = data.data.staleness;
        const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
        toast.success(`${resolveTitle(variables.mediaId)} marked stale (×${timesMarked})`);
        onAfterAction();
        void utils.invalidate(['comparisons', 'getSmartPair']);
      },
    }
  );

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = usePillarMutation<ExcludeInput, unknown>('media', [
    'comparisons',
    'excludeFromDimension',
  ]);

  const handleNA = useCallback(
    (movieId: number) => {
      if (!dimensionId || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId },
        {
          onSuccess: () => {
            toast.success(`${resolveTitle(movieId)} excluded from this dimension`);
            void utils.invalidate(['comparisons', 'getSmartPair']);
          },
        }
      );
    },
    [dimensionId, excludeMutation, resolveTitle, utils]
  );

  return { markStaleMutation, handleMarkStale, excludeMutation, handleNA };
}
