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

function useSearchQueries(debouncedQuery: string, mode: SearchMode) {
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

  return { shouldSearchMovies, shouldSearchTv, movieSearch, tvSearch };
}

function isSettled(shouldSearch: boolean, search: { isLoading: boolean; error: unknown }): boolean {
  return !shouldSearch || (!search.isLoading && !search.error);
}

function deriveResults(queries: ReturnType<typeof useSearchQueries>, debouncedQuery: string) {
  const movieResults: MovieSearchResult[] = queries.shouldSearchMovies
    ? (queries.movieSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];
  const tvResults: TvSearchResult[] = queries.shouldSearchTv
    ? (queries.tvSearch.data?.results ?? []).slice(0, MAX_RESULTS_PER_SECTION)
    : [];
  const hasQuery = debouncedQuery.length > 0;
  const noResults =
    hasQuery &&
    isSettled(queries.shouldSearchMovies, queries.movieSearch) &&
    isSettled(queries.shouldSearchTv, queries.tvSearch) &&
    movieResults.length + tvResults.length === 0;
  return { movieResults, tvResults, hasQuery, noResults };
}

function useSearchPageModel() {
  const { query, setQuery, debouncedQuery } = useSearchQueryParam();
  const [mode, setMode] = useState<SearchMode>('both');
  const queries = useSearchQueries(debouncedQuery, mode);
  const lookups = useLibraryLookups({
    shouldSearchMovies: queries.shouldSearchMovies,
    shouldSearchTv: queries.shouldSearchTv,
  });
  const actions = useSearchAddActions();
  const derived = deriveResults(queries, debouncedQuery);

  return {
    query,
    setQuery,
    debouncedQuery,
    mode,
    setMode,
    ...queries,
    lookups,
    actions,
    ...derived,
  };
}

function MovieSection({ m }: { m: ReturnType<typeof useSearchPageModel> }) {
  if (!m.shouldSearchMovies) return null;
  return (
    <MovieSearchSection
      showHeader={m.mode === 'both'}
      isLoading={m.movieSearch.isLoading}
      error={m.movieSearch.error ? { message: m.movieSearch.error.message } : null}
      onRetry={() => void m.movieSearch.refetch()}
      results={m.movieResults}
      lookups={{
        movieTmdbIds: m.lookups.movieTmdbIds,
        movieTmdbToLocalId: m.lookups.movieTmdbToLocalId,
        movieTmdbToRotation: m.lookups.movieTmdbToRotation,
      }}
      state={{
        addedIds: m.actions.addedIds,
        addingIds: m.actions.addingIds,
        addingToWatchlistIds: m.actions.addingToWatchlistIds,
        markingWatchedTmdbIds: m.actions.markingWatchedTmdbIds,
        markingWatchedMediaIds: m.actions.markingWatchedMediaIds,
        sessionMovieLocalIds: m.actions.sessionMovieLocalIds,
      }}
      handlers={{
        onAdd: m.actions.handleAddMovie,
        onAddToWatchlistAndLibrary: m.actions.handleAddToWatchlistAndLibrary,
        onMarkWatchedAndLibrary: m.actions.handleMarkWatchedAndLibrary,
        onMarkWatched: m.actions.handleMarkWatched,
      }}
      makeKey={m.actions.makeKey}
    />
  );
}

function TvSection({ m }: { m: ReturnType<typeof useSearchPageModel> }) {
  if (!m.shouldSearchTv) return null;
  return (
    <TvSearchSection
      showHeader={m.mode === 'both'}
      isLoading={m.tvSearch.isLoading}
      error={m.tvSearch.error ? { message: m.tvSearch.error.message } : null}
      onRetry={() => void m.tvSearch.refetch()}
      results={m.tvResults}
      lookups={{
        tvTvdbIds: m.lookups.tvTvdbIds,
        tvTvdbToLocalId: m.lookups.tvTvdbToLocalId,
      }}
      state={{
        addedIds: m.actions.addedIds,
        addingIds: m.actions.addingIds,
        sessionTvLocalIds: m.actions.sessionTvLocalIds,
      }}
      handlers={{ onAdd: m.actions.handleAddTvShow }}
      makeKey={m.actions.makeKey}
    />
  );
}

export function SearchPage() {
  const m = useSearchPageModel();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search for movies and TV shows to add to your library.
        </p>
      </div>
      <SearchInput
        query={m.query}
        mode={m.mode}
        onQueryChange={m.setQuery}
        onModeChange={m.setMode}
      />
      {m.noResults && <NoResultsMessage query={m.debouncedQuery} />}
      <MovieSection m={m} />
      <TvSection m={m} />
      {!m.hasQuery && <SearchEmptyPrompt />}
    </div>
  );
}
