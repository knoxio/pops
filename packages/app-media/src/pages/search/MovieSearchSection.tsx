import { buildPosterUrl, SearchResultCard } from '../../components/SearchResultCard';
import { SearchSectionError, SearchSectionSkeleton } from './SearchSectionStates';

import type { MovieSearchResult, RotationInfo } from './types';

interface MovieSectionLookups {
  movieTmdbIds: Set<number>;
  movieTmdbToLocalId: Map<number, number>;
  movieTmdbToRotation: Map<number, RotationInfo>;
}

interface MovieSectionState {
  addedIds: Set<string>;
  addingIds: Set<string>;
  addingToWatchlistIds: Set<number>;
  markingWatchedTmdbIds: Set<number>;
  markingWatchedMediaIds: Set<number>;
  sessionMovieLocalIds: Map<number, number>;
}

interface MovieSectionHandlers {
  onAdd: (tmdbId: number) => void;
  onAddToWatchlistAndLibrary: (tmdbId: number) => void;
  onMarkWatchedAndLibrary: (tmdbId: number) => void;
  onMarkWatched: (mediaId: number) => void;
}

interface MovieSearchSectionProps {
  showHeader: boolean;
  isLoading: boolean;
  error: { message: string } | null;
  onRetry: () => void;
  results: MovieSearchResult[];
  lookups: MovieSectionLookups;
  state: MovieSectionState;
  handlers: MovieSectionHandlers;
  makeKey: (type: 'movie' | 'tv', id: number) => string;
}

export function MovieSearchSection({
  showHeader,
  isLoading,
  error,
  onRetry,
  results,
  lookups,
  state,
  handlers,
  makeKey,
}: MovieSearchSectionProps) {
  return (
    <section>
      {showHeader && (
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">
          Movies{results.length > 0 ? ` (${results.length})` : ''}
        </h2>
      )}
      {isLoading && <SearchSectionSkeleton />}
      {error && (
        <SearchSectionError label="Movie search failed" message={error.message} onRetry={onRetry} />
      )}
      {!isLoading && !error && results.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((movie) => (
            <MovieCard
              key={movie.tmdbId}
              movie={movie}
              lookups={lookups}
              state={state}
              handlers={handlers}
              cardKey={makeKey('movie', movie.tmdbId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface MovieCardProps {
  movie: MovieSearchResult;
  lookups: MovieSectionLookups;
  state: MovieSectionState;
  handlers: MovieSectionHandlers;
  cardKey: string;
}

function MovieCard({ movie, lookups, state, handlers, cardKey }: MovieCardProps) {
  const inLibrary = lookups.movieTmdbIds.has(movie.tmdbId) || state.addedIds.has(cardKey);
  const localId =
    lookups.movieTmdbToLocalId.get(movie.tmdbId) ?? state.sessionMovieLocalIds.get(movie.tmdbId);
  const rotation = lookups.movieTmdbToRotation.get(movie.tmdbId);

  return (
    <SearchResultCard
      type="movie"
      tmdbId={movie.tmdbId}
      title={movie.title}
      year={movie.releaseDate?.slice(0, 4) ?? null}
      overview={movie.overview}
      posterUrl={buildPosterUrl(movie.posterPath, 'movie')}
      voteAverage={movie.voteAverage}
      inLibrary={inLibrary}
      rotationStatus={rotation?.rotationStatus}
      rotationExpiresAt={rotation?.rotationExpiresAt}
      mediaId={localId}
      isAdding={state.addingIds.has(cardKey)}
      onAdd={() => handlers.onAdd(movie.tmdbId)}
      onAddToWatchlistAndLibrary={
        inLibrary ? undefined : () => handlers.onAddToWatchlistAndLibrary(movie.tmdbId)
      }
      isAddingToWatchlistAndLibrary={state.addingToWatchlistIds.has(movie.tmdbId)}
      onMarkWatchedAndLibrary={
        inLibrary ? undefined : () => handlers.onMarkWatchedAndLibrary(movie.tmdbId)
      }
      isMarkingWatchedAndLibrary={state.markingWatchedTmdbIds.has(movie.tmdbId)}
      onMarkWatched={localId != null ? () => handlers.onMarkWatched(localId) : undefined}
      isMarkingWatched={localId != null && state.markingWatchedMediaIds.has(localId)}
      href={localId != null ? `/media/movies/${localId}` : undefined}
    />
  );
}
