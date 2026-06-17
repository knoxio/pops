import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useSetPageContext } from '@pops/navigation';

import { unwrap } from '../../media-api-helpers.js';
import {
  arrCheckSeries,
  tvShowsGet,
  tvShowsListSeasons,
  watchHistoryProgress,
} from '../../media-api/index.js';
import { useBatchLogMutation, useMonitoringMutation } from './useTvShowMutations';

import type { ProgressEnvelope, SeasonRow, SonarrSeriesData } from './types';

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
type SonarrEnvelope = { data: SonarrSeriesData | null };

function useTvShowQueries(showId: number) {
  const enabled = !Number.isNaN(showId);
  const { data, isLoading, error } = useQuery({
    queryKey: ['media', 'tvShows', 'get', { id: showId }],
    queryFn: async (): Promise<ShowEnvelope> => unwrap(await tvShowsGet({ path: { id: showId } })),
    enabled,
  });
  const { data: seasonsData } = useQuery({
    queryKey: ['media', 'tvShows', 'listSeasons', { tvShowId: showId }],
    queryFn: async (): Promise<SeasonsEnvelope> =>
      unwrap(await tvShowsListSeasons({ path: { tvShowId: showId } })),
    enabled,
  });
  const { data: progressData } = useQuery({
    queryKey: ['media', 'watchHistory', 'progress', { tvShowId: showId }],
    queryFn: async (): Promise<ProgressEnvelope> =>
      unwrap(await watchHistoryProgress({ path: { tvShowId: showId } })),
    enabled,
  });
  const tvdbId = data?.data?.tvdbId ?? 0;
  const { data: sonarrData } = useQuery({
    queryKey: ['media', 'arr', 'checkSeries', { tvdbId }],
    queryFn: async (): Promise<SonarrEnvelope> =>
      unwrap(await arrCheckSeries({ path: { tvdbId } })),
    enabled: !!data?.data?.tvdbId,
  });
  return { data, isLoading, error, seasonsData, progressData, sonarrData };
}

function sortSeasons<T extends { seasonNumber: number }>(rawSeasons: T[]): T[] {
  return [...rawSeasons].toSorted((a, b) => {
    if (a.seasonNumber === 0) return 1;
    if (b.seasonNumber === 0) return -1;
    return a.seasonNumber - b.seasonNumber;
  });
}

export function useTvShowDetailModel(showId: number) {
  const queryClient = useQueryClient();
  const queries = useTvShowQueries(showId);
  const [optimisticMonitoring, setOptimisticMonitoring] = useState<Map<number, boolean>>(new Map());
  const [pendingSeasons, setPendingSeasons] = useState<Set<number>>(new Set());

  const seasonMonitorMutation = useMonitoringMutation({
    setOptimisticMonitoring,
    setPendingSeasons,
  });
  const batchLogMutation = useBatchLogMutation(showId, queryClient);

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
