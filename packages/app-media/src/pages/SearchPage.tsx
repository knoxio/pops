import { AlertTriangle, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

/**
 * SearchPage — search TMDB (movies) and TheTVDB (TV shows) and add to library.
 *
 * Features: 300ms debounced search, type toggle (Movies/TV/Both),
 * responsive result grid, "Add to Library" with loading state,
 * "In Library" badge for items already in the collection.
 */
import { Button, Skeleton, Tabs, TabsList, TabsTrigger, TextInput } from '@pops/ui';

import {
  buildPosterUrl,
  SearchResultCard,
  type SearchResultType,
} from '../components/SearchResultCard';
import { trpc } from '../lib/trpc';

type SearchMode = 'movies' | 'tv' | 'both';

/** TMDB movie search result shape (from media.search.movies). */
interface MovieSearchResult {
  tmdbId: number;
  title: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  voteAverage: number;
  genreIds: number[];
}

/** TheTVDB search result shape (from media.search.tvShows). */
interface TvSearchResult {
  tvdbId: number;
  name: string;
  overview: string | null;
  firstAirDate: string | null;
  posterPath: string | null;
  genres: string[];
  year: string | null;
}

/** Hook: debounce a string value by `delay` ms. */
function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [mode, setMode] = useState<SearchMode>('both');
  const debouncedQuery = useDebouncedValue(query, 300);

  // Sync debounced query to URL ?q= param
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedQuery) {
          next.set('q', debouncedQuery);
        } else {
          next.delete('q');
        }
        return next;
      },
      { replace: true }
    );
  }, [debouncedQuery, setSearchParams]);

  // Track which items are being added (by external ID)
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  // Track items successfully added this session
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const shouldSearchMovies = debouncedQuery.length > 0 && (mode === 'movies' || mode === 'both');
  const shouldSearchTv = debouncedQuery.length > 0 && (mode === 'tv' || mode === 'both');

  // Search queries
  const movieSearch = trpc.media.search.movies.useQuery(
    { query: debouncedQuery },
    { enabled: shouldSearchMovies, staleTime: 60_000 }
  );
  const tvSearch = trpc.media.search.tvShows.useQuery(
    { query: debouncedQuery },
    { enabled: shouldSearchTv, staleTime: 60_000 }
  );

  // Library lookups for "In Library" detection
  const libraryMovies = trpc.media.movies.list.useQuery(
    { limit: 1000 },
    { enabled: shouldSearchMovies, staleTime: 30_000 }
  );
  const libraryTvShows = trpc.media.tvShows.list.useQuery(
    { limit: 1000 },
    { enabled: shouldSearchTv, staleTime: 30_000 }
  );

  // Build lookup sets and ID maps for navigation
  const movieTmdbIds = new Set(
    (libraryMovies.data?.data ?? []).map((m: { tmdbId: number }) => m.tmdbId)
  );
  const tvTvdbIds = new Set(
    (libraryTvShows.data?.data ?? []).map((s: { tvdbId: number }) => s.tvdbId)
  );
  const movieTmdbToLocalId = new Map(
    (libraryMovies.data?.data ?? []).map((m: { id: number; tmdbId: number }) => [m.tmdbId, m.id])
  );
  const tvTvdbToLocalId = new Map(
    (libraryTvShows.data?.data ?? []).map((s: { id: number; tvdbId: number }) => [s.tvdbId, s.id])
  );

  // Mutations
  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addTvShowMutation = trpc.media.library.addTvShow.useMutation();

  const makeKey = (type: SearchResultType, id: number) => `${type}:${id}`;

  const handleAddMovie = useCallback(
    (tmdbId: number) => {
      const key = makeKey('movie', tmdbId);
      setAddingIds((prev) => new Set(prev).add(key));
      addMovieMutation.mutate(
        { tmdbId },
        {
          onSuccess: () => {
            setAddedIds((prev) => new Set(prev).add(key));
            toast.success('Movie added to library');
          },
          onError: (err: { message: string }) => {
            toast.error(`Failed to add movie: ${err.message}`);
          },
          onSettled: () => {
            setAddingIds((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          },
        }
      );
    },
    [addMovieMutation]
  );

  const handleAddTvShow = useCallback(
    (tvdbId: number) => {
      const key = makeKey('tv', tvdbId);
      setAddingIds((prev) => new Set(prev).add(key));
      addTvShowMutation.mutate(
        { tvdbId },
        {
          onSuccess: () => {
            setAddedIds((prev) => new Set(prev).add(key));
            toast.success('TV show added to library');
          },
          onError: (err: { message: string }) => {
            toast.error(`Failed to add TV show: ${err.message}`);
          },
          onSettled: () => {
            setAddingIds((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          },
        }
      );
    },
    [addTvShowMutation]
  );

  const hasQuery = debouncedQuery.length > 0;

  const MAX_RESULTS_PER_SECTION = 20;

  // Per-section results (capped)
  const movieResults = shouldSearchMovies
    ? (movieSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];
  const tvResults = shouldSearchTv
    ? (tvSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];

  const moviesSettled = !shouldSearchMovies || (!movieSearch.isLoading && !movieSearch.error);
  const tvSettled = !shouldSearchTv || (!tvSearch.isLoading && !tvSearch.error);
  const totalResults = movieResults.length + tvResults.length;
  const noResults = hasQuery && moviesSettled && tvSettled && totalResults === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search for movies and TV shows to add to your library.
        </p>
      </div>

      {/* Search input */}
      <TextInput
        type="search"
        placeholder="Search movies and TV shows…"
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(e.target.value);
        }}
        prefix={<Search className="h-4 w-4" />}
        clearable
        onClear={() => {
          setQuery('');
        }}
        autoFocus
      />

      {/* Type toggle */}
      <Tabs
        value={mode}
        onValueChange={(v: string) => {
          setMode(v as SearchMode);
        }}
      >
        <TabsList>
          <TabsTrigger value="both">Both</TabsTrigger>
          <TabsTrigger value="movies">Movies</TabsTrigger>
          <TabsTrigger value="tv">TV Shows</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* No results */}
      {noResults && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No results found for &ldquo;{debouncedQuery}&rdquo;. Try a different search term.
        </p>
      )}

      {/* Movie section — independent loading/error/results */}
      {shouldSearchMovies && (
        <section>
          {mode === 'both' && (
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              Movies{movieResults.length > 0 ? ` (${movieResults.length})` : ''}
            </h2>
          )}
          {movieSearch.isLoading && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 rounded-lg border bg-card p-3">
                  <Skeleton className="w-20 shrink-0 rounded-md aspect-[2/3]" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-7 w-28 mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {movieSearch.error && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Movie search failed</p>
                <p className="text-xs text-muted-foreground">{movieSearch.error.message}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => movieSearch.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!movieSearch.isLoading && !movieSearch.error && movieResults.length > 0 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {movieResults.map((movie: MovieSearchResult) => {
                const key = makeKey('movie', movie.tmdbId);
                const inLibrary = movieTmdbIds.has(movie.tmdbId) || addedIds.has(key);
                const localId = movieTmdbToLocalId.get(movie.tmdbId);
                return (
                  <SearchResultCard
                    key={movie.tmdbId}
                    type="movie"
                    tmdbId={movie.tmdbId}
                    title={movie.title}
                    year={movie.releaseDate?.slice(0, 4) ?? null}
                    overview={movie.overview}
                    posterUrl={buildPosterUrl(movie.posterPath, 'movie')}
                    voteAverage={movie.voteAverage}
                    inLibrary={inLibrary}
                    isAdding={addingIds.has(key)}
                    onAdd={() => {
                      handleAddMovie(movie.tmdbId);
                    }}
                    href={localId != null ? `/media/movies/${localId}` : undefined}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TV section — independent loading/error/results */}
      {shouldSearchTv && (
        <section>
          {mode === 'both' && (
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              TV Shows{tvResults.length > 0 ? ` (${tvResults.length})` : ''}
            </h2>
          )}
          {tvSearch.isLoading && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 rounded-lg border bg-card p-3">
                  <Skeleton className="w-20 shrink-0 rounded-md aspect-[2/3]" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-7 w-28 mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {tvSearch.error && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">TV search failed</p>
                <p className="text-xs text-muted-foreground">{tvSearch.error.message}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => tvSearch.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!tvSearch.isLoading && !tvSearch.error && tvResults.length > 0 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {tvResults.map((show: TvSearchResult) => {
                const key = makeKey('tv', show.tvdbId);
                const inLibrary = tvTvdbIds.has(show.tvdbId) || addedIds.has(key);
                const localId = tvTvdbToLocalId.get(show.tvdbId);
                return (
                  <SearchResultCard
                    key={show.tvdbId}
                    type="tv"
                    title={show.name}
                    year={show.year ?? show.firstAirDate?.slice(0, 4) ?? null}
                    overview={show.overview}
                    posterUrl={buildPosterUrl(show.posterPath, 'tv')}
                    genres={show.genres}
                    inLibrary={inLibrary}
                    isAdding={addingIds.has(key)}
                    onAdd={() => {
                      handleAddTvShow(show.tvdbId);
                    }}
                    href={localId != null ? `/media/tv/${localId}` : undefined}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Empty state before search */}
      {!hasQuery && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 opacity-20 mb-4" />
          <p className="text-sm">Start typing to search for movies and TV shows.</p>
        </div>
      )}
    </div>
  );
}
