import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';

function useTvShowQueries(showId: number) {
  const enabled = !Number.isNaN(showId);
  const { data, isLoading, error } = trpc.media.tvShows.get.useQuery({ id: showId }, { enabled });
  const { data: seasonsData } = trpc.media.tvShows.listSeasons.useQuery(
    { tvShowId: showId },
    { enabled }
  );
  const { data: progressData } = trpc.media.watchHistory.progress.useQuery(
    { tvShowId: showId },
    { enabled }
  );
  const { data: sonarrData } = trpc.media.arr.checkSeries.useQuery(
    { tvdbId: data?.data?.tvdbId ?? 0 },
    { enabled: !!data?.data?.tvdbId }
  );
  return { data, isLoading, error, seasonsData, progressData, sonarrData };
}

function useMonitoringMutation({
  setOptimisticMonitoring,
  setPendingSeasons,
}: {
  setOptimisticMonitoring: React.Dispatch<React.SetStateAction<Map<number, boolean>>>;
  setPendingSeasons: React.Dispatch<React.SetStateAction<Set<number>>>;
}) {
  const utils = trpc.useUtils();
  return trpc.media.arr.updateSeasonMonitoring.useMutation({
    onError: (
      err: { message: string },
      variables: { seasonNumber: number; monitored: boolean }
    ) => {
      setOptimisticMonitoring((prev) => {
        const next = new Map(prev);
        next.set(variables.seasonNumber, !variables.monitored);
        return next;
      });
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
    onSuccess: () => {
      void utils.media.arr.checkSeries.invalidate();
    },
    onSettled: (_data: unknown, _err: unknown, variables: { seasonNumber: number }) => {
      setPendingSeasons((prev) => {
        const next = new Set(prev);
        next.delete(variables.seasonNumber);
        return next;
      });
    },
  });
}

function useBatchLogMutation(showId: number) {
  const utils = trpc.useUtils();
  const progressSnapshot =
    useRef<ReturnType<typeof utils.media.watchHistory.progress.getData>>(undefined);

  return trpc.media.watchHistory.batchLog.useMutation({
    onMutate: async () => {
      await utils.media.watchHistory.progress.cancel({ tvShowId: showId });
      progressSnapshot.current = utils.media.watchHistory.progress.getData({ tvShowId: showId });
      utils.media.watchHistory.progress.setData({ tvShowId: showId }, (old) => {
        if (!old?.data) return old;
        const updatedSeasons = old.data.seasons.map((s) => ({
          ...s,
          watched: s.total,
          percentage: 100,
        }));
        const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
        return {
          ...old,
          data: {
            ...old.data,
            seasons: updatedSeasons,
            overall: { watched: totalEpisodes, total: totalEpisodes, percentage: 100 },
            nextEpisode: null,
          },
        };
      });
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
      toast.error(`Failed to mark all watched: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchHistory.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
  });
}

function sortSeasons<T extends { seasonNumber: number }>(rawSeasons: T[]): T[] {
  return [...rawSeasons].toSorted((a, b) => {
    if (a.seasonNumber === 0) return 1;
    if (b.seasonNumber === 0) return -1;
    return a.seasonNumber - b.seasonNumber;
  });
}

export function useTvShowDetailModel(showId: number) {
  const queries = useTvShowQueries(showId);
  const [optimisticMonitoring, setOptimisticMonitoring] = useState<Map<number, boolean>>(new Map());
  const [pendingSeasons, setPendingSeasons] = useState<Set<number>>(new Set());

  const seasonMonitorMutation = useMonitoringMutation({
    setOptimisticMonitoring,
    setPendingSeasons,
  });
  const batchLogMutation = useBatchLogMutation(showId);

  const seasons = useMemo(
    () => sortSeasons(queries.seasonsData?.data ?? []),
    [queries.seasonsData]
  );

  const tvShowEntity = useMemo(
    () => ({
      uri: `pops:media/tv/${showId}`,
      type: 'tvshow' as const,
      title: queries.data?.data?.name ?? '',
    }),
    [showId, queries.data?.data?.name]
  );
  useSetPageContext({ page: 'tvshow-detail', pageType: 'drill-down', entity: tvShowEntity });

  return {
    isLoading: queries.isLoading,
    error: queries.error,
    show: queries.data?.data,
    seasons,
    progress: queries.progressData?.data,
    sonarrSeries: queries.sonarrData?.data,
    optimisticMonitoring,
    setOptimisticMonitoring,
    pendingSeasons,
    setPendingSeasons,
    seasonMonitorMutation,
    batchLogMutation,
  };
}
