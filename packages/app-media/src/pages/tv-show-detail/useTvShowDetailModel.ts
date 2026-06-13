import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useSetPageContext } from '@pops/navigation';
import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

import type { ProgressData, SeasonRow, SonarrSeriesData } from './types';

type ShowDetail = {
  id: number;
  name: string;
  tvdbId: number;
  overview: string | null;
  genres: string[] | null;
  status: string | null;
  originalLanguage: string | null;
  networks: string[] | null;
  voteAverage: number | null;
  voteCount: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
};

type ShowEnvelope = { data: ShowDetail | null };

type SeasonsEnvelope = { data: SeasonRow[] };
type ProgressEnvelope = { data: ProgressData | null };
type SonarrEnvelope = { data: SonarrSeriesData | null };

type ProgressContext = { previous: ProgressEnvelope | undefined };

function useTvShowQueries(showId: number) {
  const enabled = !Number.isNaN(showId);
  const { data, isLoading, error } = usePillarQuery<ShowEnvelope>(
    'media',
    ['tvShows', 'get'],
    { id: showId },
    { enabled }
  );
  const { data: seasonsData } = usePillarQuery<SeasonsEnvelope>(
    'media',
    ['tvShows', 'listSeasons'],
    { tvShowId: showId },
    { enabled }
  );
  const { data: progressData } = usePillarQuery<ProgressEnvelope>(
    'media',
    ['watchHistory', 'progress'],
    { tvShowId: showId },
    { enabled }
  );
  const { data: sonarrData } = usePillarQuery<SonarrEnvelope>(
    'media',
    ['arr', 'checkSeries'],
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
  const utils = usePillarUtils('media');
  return usePillarMutation<{ sonarrId: number; seasonNumber: number; monitored: boolean }, unknown>(
    'media',
    ['arr', 'updateSeasonMonitoring'],
    {
      onError: (err, variables) => {
        setOptimisticMonitoring((prev) => {
          const next = new Map(prev);
          next.set(variables.seasonNumber, !variables.monitored);
          return next;
        });
        toast.error(`Failed to update monitoring: ${err.message}`);
      },
      onSuccess: () => {
        void utils.invalidate(['arr', 'checkSeries']);
      },
      onSettled: (_data, _err, variables) => {
        setPendingSeasons((prev) => {
          const next = new Set(prev);
          next.delete(variables.seasonNumber);
          return next;
        });
      },
    }
  );
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

function useBatchLogMutation(showId: number, utils: UsePillarUtilsResult) {
  return usePillarMutation<
    { mediaType: 'show'; mediaId: number },
    { data: { logged: number } },
    ProgressContext
  >('media', ['watchHistory', 'batchLog'], {
    onMutate: () => {
      const previous = utils.setData<ProgressEnvelope>(
        ['watchHistory', 'progress'],
        { tvShowId: showId },
        (prev) => applyBatchOptimistic(prev)
      );
      return { previous };
    },
    onSuccess: (result) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? 's' : ''} as watched`
      );
    },
    onError: (err, _vars, context) => {
      if (context) {
        utils.setData<ProgressEnvelope | undefined>(
          ['watchHistory', 'progress'],
          { tvShowId: showId },
          () => context.previous
        );
      }
      toast.error(`Failed to mark all watched: ${err.message}`);
    },
    onSettled: () => {
      void utils.invalidate(['watchHistory']);
      void utils.invalidate(['tvShows', 'listSeasons']);
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
  const utils = usePillarUtils('media');
  const queries = useTvShowQueries(showId);
  const [optimisticMonitoring, setOptimisticMonitoring] = useState<Map<number, boolean>>(new Map());
  const [pendingSeasons, setPendingSeasons] = useState<Set<number>>(new Set());

  const seasonMonitorMutation = useMonitoringMutation({
    setOptimisticMonitoring,
    setPendingSeasons,
  });
  const batchLogMutation = useBatchLogMutation(showId, utils);

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
    progress: queries.progressData?.data ?? undefined,
    sonarrSeries: queries.sonarrData?.data ?? undefined,
    optimisticMonitoring,
    setOptimisticMonitoring,
    pendingSeasons,
    setPendingSeasons,
    seasonMonitorMutation,
    batchLogMutation,
  };
}
