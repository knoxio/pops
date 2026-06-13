import { useMemo } from 'react';

import { useSetPageContext } from '@pops/navigation';
import { usePillarQuery } from '@pops/pillar-sdk/react';

import { useEpisodeWatchState } from './useEpisodeWatchState';
import { useSonarrMonitoring } from './useSonarrMonitoring';

interface ShowEnvelope {
  data: { id: number; name: string; tvdbId?: number } | null;
}

interface SeasonItem {
  id: number;
  seasonNumber: number;
  name: string;
  posterUrl: string | null;
  airDate: string | null;
  overview: string | null;
}

interface SeasonsEnvelope {
  data: SeasonItem[];
}

interface EpisodeItem {
  id: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
}

interface EpisodesEnvelope {
  data: EpisodeItem[];
}

interface WatchHistoryItem {
  id: number;
  mediaId: number;
}

interface WatchHistoryEnvelope {
  data: WatchHistoryItem[];
}

interface ProgressSeason {
  seasonNumber: number;
  watched: number;
  total: number;
}

interface ProgressEnvelope {
  data: {
    seasons?: ProgressSeason[];
  } | null;
}

function useSeasonQueries(showId: number, seasonNum: number) {
  const enabled = !Number.isNaN(showId);
  const showQuery = usePillarQuery<ShowEnvelope>(
    'media',
    ['tvShows', 'get'],
    { id: showId },
    { enabled }
  );
  const seasonsQuery = usePillarQuery<SeasonsEnvelope>(
    'media',
    ['tvShows', 'listSeasons'],
    { tvShowId: showId },
    { enabled }
  );
  const season = seasonsQuery.data?.data?.find((s) => s.seasonNumber === seasonNum);
  const episodesQuery = usePillarQuery<EpisodesEnvelope>(
    'media',
    ['tvShows', 'listEpisodes'],
    { seasonId: season?.id ?? 0 },
    { enabled: !!season?.id }
  );
  return { showQuery, seasonsQuery, season, episodesQuery };
}

function useWatchHistoryAndProgress(showId: number, episodeIds: number[]) {
  const watchHistoryQuery = usePillarQuery<WatchHistoryEnvelope>(
    'media',
    ['watchHistory', 'list'],
    { mediaType: 'episode', limit: 500 },
    { enabled: episodeIds.length > 0 }
  );
  const progressQuery = usePillarQuery<ProgressEnvelope>(
    'media',
    ['watchHistory', 'progress'],
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );
  return { watchHistoryQuery, progressQuery };
}

function computeIsSeasonWatched(
  seasonProgress: { watched: number; total: number } | undefined
): boolean {
  if (!seasonProgress) return false;
  return seasonProgress.watched >= seasonProgress.total && seasonProgress.total > 0;
}

function useSeasonPageContext(showId: number, seasonNum: number, showName: string) {
  const seasonEntity = useMemo(
    () => ({
      uri: `pops:media/tv/${showId}/season/${seasonNum}`,
      type: 'season' as const,
      title: showName,
    }),
    [showId, seasonNum, showName]
  );
  useSetPageContext({ page: 'season-detail', pageType: 'drill-down', entity: seasonEntity });
}

function useSeasonInteractions({
  showId,
  seasonNum,
  showQuery,
  season,
  episodes,
  watchHistoryQuery,
}: {
  showId: number;
  seasonNum: number;
  showQuery: ReturnType<typeof useSeasonQueries>['showQuery'];
  season: ReturnType<typeof useSeasonQueries>['season'];
  episodes: { id: number }[];
  watchHistoryQuery: ReturnType<typeof useWatchHistoryAndProgress>['watchHistoryQuery'];
}) {
  const sonarr = useSonarrMonitoring({ tvdbId: showQuery.data?.data?.tvdbId, seasonNum });
  const watch = useEpisodeWatchState({
    showId,
    seasonNum,
    season,
    episodes,
    watchHistory: watchHistoryQuery.data?.data,
  });
  return { sonarr, watch };
}

export function useSeasonDetailModel(showId: number, seasonNum: number) {
  const { showQuery, seasonsQuery, season, episodesQuery } = useSeasonQueries(showId, seasonNum);

  const episodes = episodesQuery.data?.data ?? [];
  const episodeIds = useMemo(() => episodes.map((ep) => ep.id), [episodes]);

  const { watchHistoryQuery, progressQuery } = useWatchHistoryAndProgress(showId, episodeIds);

  const seasonProgress = progressQuery.data?.data?.seasons?.find(
    (s) => s.seasonNumber === seasonNum
  );

  const { sonarr, watch } = useSeasonInteractions({
    showId,
    seasonNum,
    showQuery,
    season,
    episodes,
    watchHistoryQuery,
  });

  useSeasonPageContext(showId, seasonNum, showQuery.data?.data?.name ?? '');

  return {
    showLoading: showQuery.isLoading,
    seasonsLoading: seasonsQuery.isLoading,
    showError: showQuery.error,
    show: showQuery.data?.data,
    season,
    episodes,
    episodesLoading: episodesQuery.isLoading,
    seasonProgress,
    isSeasonWatched: computeIsSeasonWatched(seasonProgress),
    sonarr,
    watch,
  };
}
