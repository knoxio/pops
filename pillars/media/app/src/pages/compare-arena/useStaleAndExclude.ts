import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { comparisonsExcludeFromDimension, comparisonsMarkStale } from '../../media-api/index.js';

import type { MediaQueryClient } from './useScoreDelta';

interface MarkStaleInput {
  mediaType: 'movie';
  mediaId: number;
}

interface ExcludeInput {
  mediaType: 'movie';
  mediaId: number;
  dimensionId: number;
}

interface Args {
  dimensionId: number | null;
  queryClient: MediaQueryClient;
  resolveTitle: (id: number) => string;
  onAfterAction: () => void;
}

export function useStaleAndExcludeMutations({
  dimensionId,
  queryClient,
  resolveTitle,
  onAfterAction,
}: Args) {
  const markStaleMutation = useMutation({
    mutationFn: async (variables: MarkStaleInput) =>
      unwrap(await comparisonsMarkStale({ body: variables })),
    onSuccess: (data, variables) => {
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${resolveTitle(variables.mediaId)} marked stale (×${timesMarked})`);
      onAfterAction();
      void queryClient.invalidateQueries({
        queryKey: ['media', 'comparisons', 'getSmartPair'],
      });
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = useMutation({
    mutationFn: async (variables: ExcludeInput) =>
      unwrap(await comparisonsExcludeFromDimension({ body: variables })),
  });

  const handleNA = useCallback(
    (movieId: number) => {
      if (!dimensionId || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId },
        {
          onSuccess: () => {
            toast.success(`${resolveTitle(movieId)} excluded from this dimension`);
            void queryClient.invalidateQueries({
              queryKey: ['media', 'comparisons', 'getSmartPair'],
            });
          },
        }
      );
    },
    [dimensionId, excludeMutation, resolveTitle, queryClient]
  );

  return { markStaleMutation, handleMarkStale, excludeMutation, handleNA };
}
