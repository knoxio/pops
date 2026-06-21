import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import { comparisonsGetSmartPair, comparisonsListDimensions } from '../../media-api/index.js';
import { useArenaActions } from './useArenaActions';
import { useArenaBlacklist } from './useArenaBlacklist';
import { useArenaWatchlist } from './useArenaWatchlist';

import type { Dimension, PairData } from './types';

interface DimensionsResult {
  data?: Dimension[];
}

interface SmartPairResult {
  data?: PairData | null;
}

export function useCompareArenaPageModel() {
  const [manualDimensionId, setManualDimensionId] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } = useQuery<DimensionsResult>({
    queryKey: ['media', 'comparisons', 'listDimensions'],
    queryFn: async () => unwrap(await comparisonsListDimensions()),
  });
  const activeDimensions: Dimension[] = dimensionsData?.data?.filter((d) => d.active) ?? [];

  const pairQuery = useQuery<SmartPairResult>({
    queryKey: ['media', 'comparisons', 'getSmartPair', { dimensionId: manualDimensionId }],
    queryFn: async () =>
      unwrap(
        await comparisonsGetSmartPair({
          query: manualDimensionId ? { dimensionId: manualDimensionId } : {},
        })
      ),
    enabled: activeDimensions.length > 0,
    refetchOnWindowFocus: false,
    gcTime: 0,
    staleTime: 0,
  });

  const queryClient = useQueryClient();
  const pair: PairData | null | undefined = pairQuery.data?.data;
  const dimensionId = pair?.dimensionId ?? null;

  const resolveTitle = useCallback(
    (mediaId: number) => {
      if (pair?.movieA.id === mediaId) return pair.movieA.title;
      if (pair?.movieB.id === mediaId) return pair.movieB.title;
      return 'Movie';
    },
    [pair]
  );

  const onAfterAction = useCallback(() => setManualDimensionId(null), []);

  const watchlist = useArenaWatchlist({ enabled: !!pair, resolveTitle });
  const actions = useArenaActions({ pair, dimensionId, resolveTitle, onAfterAction });
  const blacklist = useArenaBlacklist({ resolveTitle, onAfterAction });

  const activeDim = activeDimensions.find((d) => d.id === dimensionId);

  const onDimensionChange = useCallback(
    (id: number) => {
      setManualDimensionId(id);
      actions.setScoreDelta(null);
      void queryClient.invalidateQueries({
        queryKey: ['media', 'comparisons', 'getSmartPair'],
      });
    },
    [actions, queryClient]
  );

  return {
    dimsLoading,
    activeDimensions,
    pair,
    pairQuery,
    dimensionId,
    activeDimName: activeDim?.name ?? 'Overall',
    activeDimDesc: activeDim?.description ?? null,
    watchlist,
    actions,
    blacklist,
    onDimensionChange,
  };
}
