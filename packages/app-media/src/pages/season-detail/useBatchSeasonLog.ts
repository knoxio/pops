import { useCallback } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

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
  utils: UsePillarUtilsResult,
  showId: number,
  seasonNum: number,
  episodes: Array<{ id: number }>
): BatchLogContext {
  const previousProgress = utils.setData<ProgressEnvelope>(
    ['watchHistory', 'progress'],
    { tvShowId: showId },
    buildProgressUpdater(seasonNum)
  );
  let previousList: WatchHistoryEnvelope | undefined;
  if (episodes.length > 0) {
    previousList = utils.setData<WatchHistoryEnvelope>(
      ['watchHistory', 'list'],
      LIST_INPUT,
      buildListUpdater(episodes)
    );
  }
  return { previousProgress, previousList };
}

function rollbackOptimistic(
  utils: UsePillarUtilsResult,
  showId: number,
  context: BatchLogContext | undefined
) {
  if (!context) return;
  if (context.previousProgress !== undefined) {
    utils.setData<ProgressEnvelope | undefined>(
      ['watchHistory', 'progress'],
      { tvShowId: showId },
      () => context.previousProgress
    );
  }
  if (context.previousList !== undefined) {
    utils.setData<WatchHistoryEnvelope | undefined>(
      ['watchHistory', 'list'],
      LIST_INPUT,
      () => context.previousList
    );
  }
}

export function useBatchSeasonLog({ showId, seasonNum, season, episodes }: UseBatchSeasonLogArgs) {
  const utils = usePillarUtils('media');

  const batchLogMutation = usePillarMutation<
    { mediaType: 'season'; mediaId: number },
    { data: { logged: number } },
    BatchLogContext
  >('media', ['watchHistory', 'batchLog'], {
    onMutate: () => applyOptimistic(utils, showId, seasonNum, episodes),
    onSuccess: (result) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err, _vars, context) => {
      rollbackOptimistic(utils, showId, context);
      toast.error(`Failed to mark season: ${err.message}`);
    },
    onSettled: () => {
      void utils.invalidate(['watchHistory']);
      void utils.invalidate(['tvShows', 'listSeasons']);
    },
  });

  const handleBatchMarkWatched = useCallback(() => {
    if (!season) return;
    batchLogMutation.mutate({ mediaType: 'season', mediaId: season.id });
  }, [batchLogMutation, season]);

  return { batchLogMutation, handleBatchMarkWatched };
}
