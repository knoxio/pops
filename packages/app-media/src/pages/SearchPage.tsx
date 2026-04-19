/**
 * SearchPage — search TMDB (movies) and TheTVDB (TV shows) and add to library.
 *
 * Features: 300ms debounced search, type toggle (Movies/TV/Both),
 * responsive result grid, "Add to Library" with loading state,
 * "In Library" badge for items already in the collection.
 *
 * In-library items get a clickable card link to the detail page, a
 * WatchlistToggle, and (movies) a Mark as Watched button.
 *
 * Not-in-library items get compound "Watchlist + Library" and (movies)
 * "Watched + Library" buttons that add the item then trigger the secondary
 * action in a single click.
 */
import { Search } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@pops/api-client';

import { MovieSearchSection } from './search/MovieSearchSection';
import { SearchInput } from './search/SearchInput';
import { TvSearchSection } from './search/TvSearchSection';
import { useLibraryLookups } from './search/useLibraryLookups';
import { useSearchAddActions } from './search/useSearchAddActions';
import { useSearchQueryParam } from './search/useSearchQueryParam';

import type { MovieSearchResult, SearchMode, TvSearchResult } from './search/types';

const MAX_RESULTS_PER_SECTION = 20;
const STALE_TIME_MS = 60_000;

function SearchEmptyPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Search className="h-12 w-12 opacity-20 mb-4" />
      <p className="text-sm">Start typing to search for movies and TV shows.</p>
    </div>
  );
}

function NoResultsMessage({ query }: { query: string }) {
  return (
    <p className="text-sm text-muted-foreground py-8 text-center">
      No results found for &ldquo;{query}&rdquo;. Try a different search term.
    </p>
  );
}

export function SearchPage() {
  const { query, setQuery, debouncedQuery } = useSearchQueryParam();
  const [mode, setMode] = useState<SearchMode>('both');

  const shouldSearchMovies = debouncedQuery.length > 0 && (mode === 'movies' || mode === 'both');
  const shouldSearchTv = debouncedQuery.length > 0 && (mode === 'tv' || mode === 'both');

  const movieSearch = trpc.media.search.movies.useQuery(
    { query: debouncedQuery },
    { enabled: shouldSearchMovies, staleTime: STALE_TIME_MS }
  );
  const tvSearch = trpc.media.search.tvShows.useQuery(
    { query: debouncedQuery },
    { enabled: shouldSearchTv, staleTime: STALE_TIME_MS }
  );

  const lookups = useLibraryLookups({ shouldSearchMovies, shouldSearchTv });
  const actions = useSearchAddActions();

  const movieResults: MovieSearchResult[] = shouldSearchMovies
    ? (movieSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];
  const tvResults: TvSearchResult[] = shouldSearchTv
    ? (tvSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];

  const moviesSettled = !shouldSearchMovies || (!movieSearch.isLoading && !movieSearch.error);
  const tvSettled = !shouldSearchTv || (!tvSearch.isLoading && !tvSearch.error);
  const hasQuery = debouncedQuery.length > 0;
  const noResults =
    hasQuery && moviesSettled && tvSettled && movieResults.length + tvResults.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search for movies and TV shows to add to your library.
        </p>
      </div>

      <SearchInput query={query} mode={mode} onQueryChange={setQuery} onModeChange={setMode} />

      {noResults && <NoResultsMessage query={debouncedQuery} />}

      {shouldSearchMovies && (
        <MovieSearchSection
          showHeader={mode === 'both'}
          isLoading={movieSearch.isLoading}
          error={movieSearch.error ? { message: movieSearch.error.message } : null}
          onRetry={() => void movieSearch.refetch()}
          results={movieResults}
          lookups={{
            movieTmdbIds: lookups.movieTmdbIds,
            movieTmdbToLocalId: lookups.movieTmdbToLocalId,
            movieTmdbToRotation: lookups.movieTmdbToRotation,
          }}
          state={{
            addedIds: actions.addedIds,
            addingIds: actions.addingIds,
            addingToWatchlistIds: actions.addingToWatchlistIds,
            markingWatchedTmdbIds: actions.markingWatchedTmdbIds,
            markingWatchedMediaIds: actions.markingWatchedMediaIds,
            sessionMovieLocalIds: actions.sessionMovieLocalIds,
          }}
          handlers={{
            onAdd: actions.handleAddMovie,
            onAddToWatchlistAndLibrary: actions.handleAddToWatchlistAndLibrary,
            onMarkWatchedAndLibrary: actions.handleMarkWatchedAndLibrary,
            onMarkWatched: actions.handleMarkWatched,
          }}
          makeKey={actions.makeKey}
        />
      )}

      {shouldSearchTv && (
        <TvSearchSection
          showHeader={mode === 'both'}
          isLoading={tvSearch.isLoading}
          error={tvSearch.error ? { message: tvSearch.error.message } : null}
          onRetry={() => void tvSearch.refetch()}
          results={tvResults}
          lookups={{
            tvTvdbIds: lookups.tvTvdbIds,
            tvTvdbToLocalId: lookups.tvTvdbToLocalId,
          }}
          state={{
            addedIds: actions.addedIds,
            addingIds: actions.addingIds,
            sessionTvLocalIds: actions.sessionTvLocalIds,
          }}
          handlers={{ onAdd: actions.handleAddTvShow }}
          makeKey={actions.makeKey}
        />
      )}

      {!hasQuery && <SearchEmptyPrompt />}
    </div>
  );
}
