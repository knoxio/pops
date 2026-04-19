import { useMemo } from 'react';

import { trpc } from '@pops/api-client';

import type { RotationInfo } from './types';

interface UseLibraryLookupsArgs {
  shouldSearchMovies: boolean;
  shouldSearchTv: boolean;
}

interface LibraryMovie {
  id: number;
  tmdbId: number;
  rotationStatus?: 'leaving' | 'protected' | null;
  rotationExpiresAt?: string | null;
}

interface LibraryTvShow {
  id: number;
  tvdbId: number;
}

/**
 * Fetches existing-library movies and TV shows so the search results can
 * mark items as "in library" and link to their detail pages.
 */
export function useLibraryLookups({ shouldSearchMovies, shouldSearchTv }: UseLibraryLookupsArgs) {
  const libraryMovies = trpc.media.movies.list.useQuery(
    { limit: 1000 },
    { enabled: shouldSearchMovies, staleTime: 30_000 }
  );
  const libraryTvShows = trpc.media.tvShows.list.useQuery(
    { limit: 1000 },
    { enabled: shouldSearchTv, staleTime: 30_000 }
  );

  return useMemo(() => {
    const movies: LibraryMovie[] = libraryMovies.data?.data ?? [];
    const tvShows: LibraryTvShow[] = libraryTvShows.data?.data ?? [];

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
