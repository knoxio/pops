import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchHistoryBatchLog } from '../../media-api/index.js';

interface UseBatchSeasonLogArgs {
  showId: number;
  seasonNum: number;
  season: { id: number } | undefined;
  episodes: Array<{ id: number }>;
}

type ProgressSeason = {
  seasonNumber: number;
  watched: number;
  total: number;
  percentage: number;
};

type ProgressEnvelope = {
  data: {
    overall: { watched: number; total: number; percentage: number };
    seasons?: ProgressSeason[];
    nextEpisode?: unknown;
  } | null;
};

type WatchHistoryEntry = {
  id: number;
  mediaType: 'episode';
  mediaId: number;
  watchedAt: string;
  completed: number;
};

type WatchHistoryEnvelope = {
  data: WatchHistoryEntry[];
  pagination?: unknown;
};

type BatchLogContext = {
  previousProgress: ProgressEnvelope | undefined;
  previousList: WatchHistoryEnvelope | undefined;
};

const LIST_INPUT = { mediaType: 'episode' as const, limit: 500 };

const PROGRESS_KEY = (showId: number) =>
  ['media', 'watchHistory', 'progress', { tvShowId: showId }] as const;
const LIST_KEY = ['media', 'watchHistory', 'list', LIST_INPUT] as const;

function writeCache<TData>(
  queryClient: QueryClient,
  key: readonly unknown[],
  updater: (previous: TData | undefined) => TData | undefined
): TData | undefined {
  const previous = queryClient.getQueryData<TData>(key);
  queryClient.setQueryData<TData>(key, updater(previous));
  return previous;
}

function buildProgressUpdater(seasonNum: number) {
  return (envelope: ProgressEnvelope | undefined): ProgressEnvelope | undefined => {
    if (!envelope?.data) return envelope;
    const updatedSeasons = (envelope.data.seasons ?? []).map((s) =>
      s.seasonNumber === seasonNum ? { ...s, watched: s.total, percentage: 100 } : s
    );
    const totalWatched = updatedSeasons.reduce((sum, s) => sum + s.watched, 0);
    const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
    return {
      ...envelope,
      data: {
        ...envelope.data,
        seasons: updatedSeasons,
        overall: {
          watched: totalWatched,
          total: totalEpisodes,
          percentage: totalEpisodes > 0 ? Math.round((totalWatched / totalEpisodes) * 100) : 0,
        },
      },
    };
  };
}

function buildListUpdater(episodes: Array<{ id: number }>) {
  return (envelope: WatchHistoryEnvelope | undefined): WatchHistoryEnvelope | undefined => {
    if (!envelope?.data) return envelope;
    const existingIds = new Set(envelope.data.map((e) => e.mediaId));
    const newEntries: WatchHistoryEntry[] = episodes
      .filter((ep) => !existingIds.has(ep.id))
      .map((ep) => ({
        id: -ep.id,
        mediaType: 'episode',
        mediaId: ep.id,
        watchedAt: new Date().toISOString(),
        completed: 1,
      }));
    return { ...envelope, data: [...envelope.data, ...newEntries] };
  };
}

function applyOptimistic(
  queryClient: QueryClient,
  showId: number,
  seasonNum: number,
  episodes: Array<{ id: number }>
): BatchLogContext {
  const previousProgress = writeCache<ProgressEnvelope>(
    queryClient,
    PROGRESS_KEY(showId),
    buildProgressUpdater(seasonNum)
  );
  let previousList: WatchHistoryEnvelope | undefined;
  if (episodes.length > 0) {
    previousList = writeCache<WatchHistoryEnvelope>(
      queryClient,
      LIST_KEY,
      buildListUpdater(episodes)
    );
  }
  return { previousProgress, previousList };
}

function rollbackOptimistic(
  queryClient: QueryClient,
  showId: number,
  context: BatchLogContext | undefined
) {
  if (!context) return;
  if (context.previousProgress !== undefined) {
    writeCache<ProgressEnvelope | undefined>(
      queryClient,
      PROGRESS_KEY(showId),
      () => context.previousProgress
    );
  }
  if (context.previousList !== undefined) {
    writeCache<WatchHistoryEnvelope | undefined>(queryClient, LIST_KEY, () => context.previousList);
  }
}

interface BatchLogInput {
  mediaType: 'season';
  mediaId: number;
}

export function useBatchSeasonLog({ showId, seasonNum, season, episodes }: UseBatchSeasonLogArgs) {
  const queryClient = useQueryClient();

  const batchLogMutation = useMutation<
    { data: { logged: number } },
    Error,
    BatchLogInput,
    BatchLogContext
  >({
    mutationFn: async (variables) =>
      unwrap(
        await watchHistoryBatchLog({
          body: { mediaType: variables.mediaType, mediaId: variables.mediaId, completed: 1 },
        })
      ),
    onMutate: () => applyOptimistic(queryClient, showId, seasonNum, episodes),
    onSuccess: (result) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err, _vars, context) => {
      rollbackOptimistic(queryClient, showId, context);
      toast.error(`Failed to mark season: ${err.message}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchHistory'] });
      void queryClient.invalidateQueries({ queryKey: ['media', 'tvShows', 'listSeasons'] });
    },
  });

  const handleBatchMarkWatched = useCallback(() => {
    if (!season) return;
    batchLogMutation.mutate({ mediaType: 'season', mediaId: season.id });
  }, [batchLogMutation, season]);

  return { batchLogMutation, handleBatchMarkWatched };
}
