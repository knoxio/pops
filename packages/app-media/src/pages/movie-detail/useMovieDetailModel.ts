import { useMemo } from 'react';

import { useSetPageContext } from '@pops/navigation';
import { usePillarQuery } from '@pops/pillar-sdk/react';

interface Movie {
  id: number;
  tmdbId: number;
  title: string;
  tagline: string | null;
  runtime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  rotationStatus: string | null;
  rotationExpiresAt: string | null;
  releaseDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  budget: number | null;
  revenue: number | null;
  overview: string | null;
  genres: string[];
}

interface MovieGetResponse {
  data: Movie | null;
}

interface WatchHistoryListResponse {
  data: Array<{
    id: number;
    mediaType: 'movie' | 'tv_show';
    mediaId: number;
    watchedAt: string;
    completed: number;
  }>;
}

interface StalenessResponse {
  data: { staleness: number };
}

function useMovieQueries(movieId: number) {
  const enabled = !Number.isNaN(movieId);
  const { data, isLoading, error } = usePillarQuery<MovieGetResponse>(
    'media',
    ['movies', 'get'],
    { id: movieId },
    { enabled }
  );
  const { data: watchHistoryData } = usePillarQuery<WatchHistoryListResponse>(
    'media',
    ['watchHistory', 'list'],
    { mediaType: 'movie', mediaId: movieId },
    { enabled }
  );
  const { data: stalenessData } = usePillarQuery<StalenessResponse>(
    'media',
    ['comparisons', 'getStaleness'],
    { mediaType: 'movie', mediaId: movieId },
    { enabled }
  );
  return { data, isLoading, error, watchHistoryData, stalenessData };
}

function computeDaysSinceWatch(watchEntries: { watchedAt: string }[]): number | null {
  if (watchEntries.length === 0) return null;
  const mostRecentWatch = watchEntries.reduce((latest, entry) =>
    new Date(entry.watchedAt) > new Date(latest.watchedAt) ? entry : latest
  );
  return Math.floor(
    (Date.now() - new Date(mostRecentWatch.watchedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function useMovieDetailModel(movieId: number) {
  const queries = useMovieQueries(movieId);

  const movieEntity = useMemo(
    () => ({
      uri: `pops:media/movie/${movieId}`,
      type: 'movie' as const,
      title: queries.data?.data?.title ?? '',
    }),
    [movieId, queries.data?.data?.title]
  );
  useSetPageContext({ page: 'movie-detail', pageType: 'drill-down', entity: movieEntity });

  const movie = queries.data?.data;
  const watchEntries = queries.watchHistoryData?.data ?? [];

  return {
    isLoading: queries.isLoading,
    error: queries.error,
    movie,
    watchHistoryData: queries.watchHistoryData,
    daysSinceWatch: computeDaysSinceWatch(watchEntries),
    staleness: queries.stalenessData?.data?.staleness ?? 1.0,
  };
}
