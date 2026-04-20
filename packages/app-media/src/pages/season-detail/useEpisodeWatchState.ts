import { useMemo } from 'react';

import { useBatchSeasonLog } from './useBatchSeasonLog';
import { useEpisodeToggle } from './useEpisodeToggle';

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
  const watchedEpisodeIds = useMemo(() => {
    if (!watchHistory) return new Set<number>();
    const episodeIdSet = new Set<number>(episodes.map((e) => e.id));
    return new Set<number>(
      watchHistory.filter((entry) => episodeIdSet.has(entry.mediaId)).map((entry) => entry.mediaId)
    );
  }, [watchHistory, episodes]);

  const { togglingIds, handleToggleWatched } = useEpisodeToggle({ watchHistory });
  const { batchLogMutation, handleBatchMarkWatched } = useBatchSeasonLog({
    showId,
    seasonNum,
    season,
    episodes,
  });

  return {
    watchedEpisodeIds,
    togglingIds,
    handleToggleWatched,
    batchLogPending: batchLogMutation.isPending,
    handleBatchMarkWatched,
  };
}
