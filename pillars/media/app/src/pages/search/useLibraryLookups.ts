import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import { moviesList, tvShowsList } from '../../media-api/index.js';

import type { RotationInfo } from './types';

interface UseLibraryLookupsArgs {
  shouldSearchMovies: boolean;
  shouldSearchTv: boolean;
}

/**
 * Fetches existing-library movies and TV shows so the search results can
 * mark items as "in library" and link to their detail pages.
 */
export function useLibraryLookups({ shouldSearchMovies, shouldSearchTv }: UseLibraryLookupsArgs) {
  const libraryMovies = useQuery({
    queryKey: ['media', 'movies', 'list', { limit: 1000 }],
    queryFn: async () => unwrap(await moviesList({ query: { limit: 1000 } })),
    enabled: shouldSearchMovies,
    staleTime: 30_000,
  });
  const libraryTvShows = useQuery({
    queryKey: ['media', 'tvShows', 'list', { limit: 1000 }],
    queryFn: async () => unwrap(await tvShowsList({ query: { limit: 1000 } })),
    enabled: shouldSearchTv,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const movies = libraryMovies.data?.data ?? [];
    const tvShows = libraryTvShows.data?.data ?? [];

    const movieTmdbIds = new Set(movies.map((m) => m.tmdbId));
    const tvTvdbIds = new Set(tvShows.map((s) => s.tvdbId));
    const movieTmdbToLocalId = new Map(movies.map((m) => [m.tmdbId, m.id]));
    const tvTvdbToLocalId = new Map(tvShows.map((s) => [s.tvdbId, s.id]));
    const movieTmdbToRotation = new Map<number, RotationInfo>(
      movies.map((m) => [
        m.tmdbId,
        { rotationStatus: m.rotationStatus, rotationExpiresAt: m.rotationExpiresAt },
      ])
    );

    return {
      movieTmdbIds,
      tvTvdbIds,
      movieTmdbToLocalId,
      tvTvdbToLocalId,
      movieTmdbToRotation,
    };
  }, [libraryMovies.data, libraryTvShows.data]);
}
