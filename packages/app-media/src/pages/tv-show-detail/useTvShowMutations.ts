import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { arrUpdateSeasonMonitoring, watchHistoryBatchLog } from '../../media-api/index.js';

import type { Dispatch, SetStateAction } from 'react';

import type { ProgressEnvelope } from './types';

interface SeasonMonitoringInput {
  sonarrId: number;
  seasonNumber: number;
  monitored: boolean;
}

export function useMonitoringMutation({
  setOptimisticMonitoring,
  setPendingSeasons,
}: {
  setOptimisticMonitoring: Dispatch<SetStateAction<Map<number, boolean>>>;
  setPendingSeasons: Dispatch<SetStateAction<Set<number>>>;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: SeasonMonitoringInput) =>
      unwrap(
        await arrUpdateSeasonMonitoring({
          path: { sonarrId: variables.sonarrId, seasonNumber: variables.seasonNumber },
          body: { monitored: variables.monitored },
        })
      ),
    onError: (err: Error, variables) => {
      setOptimisticMonitoring((prev) => {
        const next = new Map(prev);
        next.set(variables.seasonNumber, !variables.monitored);
        return next;
      });
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'arr', 'checkSeries'] });
    },
    onSettled: (_data, _err, variables) => {
      setPendingSeasons((prev) => {
        const next = new Set(prev);
        next.delete(variables.seasonNumber);
        return next;
      });
    },
  });
}

function applyBatchOptimistic(
  envelope: ProgressEnvelope | undefined
): ProgressEnvelope | undefined {
  if (!envelope?.data) return envelope;
  const updatedSeasons = (envelope.data.seasons ?? []).map((s) => ({
    ...s,
    watched: s.total,
    percentage: 100,
  }));
  const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
  return {
    ...envelope,
    data: {
      ...envelope.data,
      seasons: updatedSeasons,
      overall: { watched: totalEpisodes, total: totalEpisodes, percentage: 100 },
      nextEpisode: null,
    },
  };
}

interface BatchLogInput {
  mediaType: 'show';
  mediaId: number;
}

type ProgressContext = { previous: ProgressEnvelope | undefined };

function progressKey(showId: number) {
  return ['media', 'watchHistory', 'progress', { tvShowId: showId }] as const;
}

export function useBatchLogMutation(showId: number, queryClient: QueryClient) {
  return useMutation<{ data: { logged: number } }, Error, BatchLogInput, ProgressContext>({
    mutationFn: async (variables) =>
      unwrap(
        await watchHistoryBatchLog({
          body: { mediaType: variables.mediaType, mediaId: variables.mediaId, completed: 1 },
        })
      ),
    onMutate: () => {
      const key = progressKey(showId);
      const previous = queryClient.getQueryData<ProgressEnvelope>(key);
      queryClient.setQueryData<ProgressEnvelope>(key, applyBatchOptimistic(previous));
      return { previous };
    },
    onSuccess: (result) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err, _vars, context) => {
      if (context) {
        queryClient.setQueryData<ProgressEnvelope | undefined>(
          progressKey(showId),
          context.previous
        );
      }
      toast.error(`Failed to mark all watched: ${err.message}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchHistory'] });
      void queryClient.invalidateQueries({ queryKey: ['media', 'tvShows', 'listSeasons'] });
    },
  });
}
