import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseBatchSeasonLogArgs {
  showId: number;
  seasonNum: number;
  season: { id: number } | undefined;
  episodes: Array<{ id: number }>;
}

type Utils = ReturnType<typeof trpc.useUtils>;

function buildProgressUpdater(seasonNum: number) {
  return (
    old: Parameters<Utils['media']['watchHistory']['progress']['setData']>[1] extends infer T
      ? T extends (input: infer I) => unknown
        ? I
        : never
      : never
  ) => {
    if (!old?.data) return old;
    const updatedSeasons = old.data.seasons.map((s) =>
      s.seasonNumber === seasonNum ? { ...s, watched: s.total, percentage: 100 } : s
    );
    const totalWatched = updatedSeasons.reduce((sum, s) => sum + s.watched, 0);
    const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
    return {
      ...old,
      data: {
        ...old.data,
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

function applyOptimistic(
  utils: Utils,
  showId: number,
  seasonNum: number,
  episodes: Array<{ id: number }>
) {
  utils.media.watchHistory.progress.setData({ tvShowId: showId }, buildProgressUpdater(seasonNum));

  if (episodes.length > 0) {
    utils.media.watchHistory.list.setData({ mediaType: 'episode', limit: 500 }, (old) => {
      if (!old?.data) return old;
      const existingIds = new Set(old.data.map((e: { mediaId: number }) => e.mediaId));
      const newEntries = episodes
        .filter((ep) => !existingIds.has(ep.id))
        .map((ep) => ({
          id: -ep.id,
          mediaType: 'episode' as const,
          mediaId: ep.id,
          watchedAt: new Date().toISOString(),
          completed: 1,
        }));
      return { ...old, data: [...old.data, ...newEntries] };
    });
  }
}

function useOptimisticUpdates({
  showId,
  seasonNum,
  episodes,
}: Omit<UseBatchSeasonLogArgs, 'season'>) {
  const utils = trpc.useUtils();
  const progressSnapshot =
    useRef<ReturnType<typeof utils.media.watchHistory.progress.getData>>(undefined);
  const listSnapshot = useRef<ReturnType<typeof utils.media.watchHistory.list.getData>>(undefined);

  const apply = async () => {
    await utils.media.watchHistory.progress.cancel({ tvShowId: showId });
    await utils.media.watchHistory.list.cancel();
    progressSnapshot.current = utils.media.watchHistory.progress.getData({ tvShowId: showId });
    listSnapshot.current = utils.media.watchHistory.list.getData({
      mediaType: 'episode',
      limit: 500,
    });
    applyOptimistic(utils, showId, seasonNum, episodes);
  };

  const rollback = () => {
    if (progressSnapshot.current !== undefined) {
      utils.media.watchHistory.progress.setData({ tvShowId: showId }, progressSnapshot.current);
    }
    if (listSnapshot.current !== undefined) {
      utils.media.watchHistory.list.setData(
        { mediaType: 'episode', limit: 500 },
        listSnapshot.current
      );
    }
  };

  return { utils, apply, rollback };
}

export function useBatchSeasonLog({ showId, seasonNum, season, episodes }: UseBatchSeasonLogArgs) {
  const { utils, apply, rollback } = useOptimisticUpdates({ showId, seasonNum, episodes });

  const batchLogMutation = trpc.media.watchHistory.batchLog.useMutation({
    onMutate: apply,
    onSuccess: (result: { data: { logged: number } }) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err: { message: string }) => {
      rollback();
      toast.error(`Failed to mark season: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchHistory.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
  });

  const handleBatchMarkWatched = useCallback(() => {
    if (!season) return;
    batchLogMutation.mutate({ mediaType: 'season', mediaId: season.id });
  }, [batchLogMutation, season]);

  return { batchLogMutation, handleBatchMarkWatched };
}
