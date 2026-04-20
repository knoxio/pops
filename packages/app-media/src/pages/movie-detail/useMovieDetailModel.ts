import { useMemo } from 'react';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';

function useMovieQueries(movieId: number) {
  const enabled = !Number.isNaN(movieId);
  const { data, isLoading, error } = trpc.media.movies.get.useQuery({ id: movieId }, { enabled });
  const { data: watchHistoryData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: 'movie', mediaId: movieId },
    { enabled }
  );
  const { data: stalenessData } = trpc.media.comparisons.getStaleness.useQuery(
    { mediaType: 'movie', mediaId: movieId },
    { enabled }
  );
  const { data: pendingDebriefData } = trpc.media.comparisons.getPendingDebriefs.useQuery(
    undefined,
    { enabled }
  );
  return { data, isLoading, error, watchHistoryData, stalenessData, pendingDebriefData };
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

  const pendingDebrief = movie
    ? (queries.pendingDebriefData?.data ?? []).find(
        (d: { movieId: number; status: string }) =>
          d.movieId === movie.id && (d.status === 'pending' || d.status === 'active')
      )
    : undefined;

  return {
    isLoading: queries.isLoading,
    error: queries.error,
    movie,
    watchHistoryData: queries.watchHistoryData,
    daysSinceWatch: computeDaysSinceWatch(watchEntries),
    staleness: queries.stalenessData?.data?.staleness ?? 1.0,
    pendingDebrief,
  };
}
