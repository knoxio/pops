import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseEpisodeWatchStateArgs {
  showId: number;
  seasonNum: number;
  season: { id: number } | undefined;
  episodes: Array<{ id: number }>;
  watchHistory: Array<{ id: number; mediaId: number }> | undefined;
}

/**
 * Hook owning the watch-history side of the SeasonDetailPage:
 * - which episodes are watched
 * - per-episode toggle (log + delete)
 * - season-level batch log with optimistic progress + history updates
 */
export function useEpisodeWatchState({
  showId,
  seasonNum,
  season,
  episodes,
  watchHistory,
}: UseEpisodeWatchStateArgs) {
  const utils = trpc.useUtils();

  const watchedEpisodeIds = useMemo(() => {
    if (!watchHistory) return new Set<number>();
    const episodeIdSet = new Set<number>(episodes.map((e) => e.id));
    return new Set<number>(
      watchHistory.filter((entry) => episodeIdSet.has(entry.mediaId)).map((entry) => entry.mediaId)
    );
  }, [watchHistory, episodes]);

  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const progressSnapshot =
    useRef<ReturnType<typeof utils.media.watchHistory.progress.getData>>(undefined);
  const listSnapshot = useRef<ReturnType<typeof utils.media.watchHistory.list.getData>>(undefined);

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { mediaId: number }) => {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.mediaId);
        return next;
      });
    },
  });

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to remove watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { id: number }) => {
      const episodeId = deleteEntryToEpisode.current.get(variables.id);
      deleteEntryToEpisode.current.delete(variables.id);
      if (episodeId != null) {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
      }
    },
  });

  const handleToggleWatched = useCallback(
    (episodeId: number, watched: boolean) => {
      setTogglingIds((prev) => new Set(prev).add(episodeId));

      if (watched) {
        logMutation.mutate({ mediaType: 'episode', mediaId: episodeId });
        return;
      }

      const entry = watchHistory?.find((e) => e.mediaId === episodeId);
      if (entry) {
        deleteEntryToEpisode.current.set(entry.id, episodeId);
        deleteMutation.mutate({ id: entry.id });
      } else {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
      }
    },
    [logMutation, deleteMutation, watchHistory]
  );

  const batchLogMutation = trpc.media.watchHistory.batchLog.useMutation({
    onMutate: async () => {
      await utils.media.watchHistory.progress.cancel({ tvShowId: showId });
      await utils.media.watchHistory.list.cancel();
      progressSnapshot.current = utils.media.watchHistory.progress.getData({ tvShowId: showId });
      listSnapshot.current = utils.media.watchHistory.list.getData({
        mediaType: 'episode',
        limit: 500,
      });

      utils.media.watchHistory.progress.setData({ tvShowId: showId }, (old) => {
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
      });

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
    },
    onSuccess: (result: { data: { logged: number } }) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err: { message: string }) => {
      if (progressSnapshot.current !== undefined) {
        utils.media.watchHistory.progress.setData({ tvShowId: showId }, progressSnapshot.current);
      }
      if (listSnapshot.current !== undefined) {
        utils.media.watchHistory.list.setData(
          { mediaType: 'episode', limit: 500 },
          listSnapshot.current
        );
      }
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

  return {
    watchedEpisodeIds,
    togglingIds,
    handleToggleWatched,
    batchLogPending: batchLogMutation.isPending,
    handleBatchMarkWatched,
  };
}
