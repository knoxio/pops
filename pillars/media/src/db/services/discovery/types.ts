/**
 * Discovery domain shapes — preference profile, discover results, and the
 * TMDB genre map. Pure types + the static genre lookup, shared by the db
 * services (profile/scoring/library/rewatch) and the api orchestration.
 *
 * Ported verbatim from the monolith `discovery/types.ts`; the zod query
 * schemas live in the contract (`rest-discovery-schemas.ts`) instead.
 */

/** A genre the user rates highly, derived from `media_scores` joined to `movies.genres`. */
export interface GenreAffinity {
  genre: string;
  avgScore: number;
  movieCount: number;
  totalComparisons: number;
}

/** A comparison dimension weighted by how much the user has engaged with it. */
export interface DimensionWeight {
  dimensionId: number;
  name: string;
  comparisonCount: number;
  avgScore: number;
}

/** How often the user has watched movies of a given genre, as a share of all watches. */
export interface GenreDistribution {
  genre: string;
  watchCount: number;
  percentage: number;
}

/** The full computed preference profile driving scoring + shelf generation. */
export interface PreferenceProfile {
  genreAffinities: GenreAffinity[];
  dimensionWeights: DimensionWeight[];
  genreDistribution: GenreDistribution[];
  totalMoviesWatched: number;
  totalComparisons: number;
}

/** A random unwatched library movie surfaced by the quick-pick flow. */
export interface QuickPickMovie {
  id: number;
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: string;
  runtime: number | null;
}

/** A discover result item (from TMDB or local library). */
export interface DiscoverResult {
  tmdbId: number;
  title: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  popularity: number;
  /** Whether this movie is already in the user's library. */
  inLibrary: boolean;
  /** Whether the user has watched this movie (has a watch_history entry). */
  isWatched: boolean;
  /** Whether this movie is on the user's watchlist. */
  onWatchlist: boolean;
  /** ISO timestamp when the movie is scheduled to leave (rotation). */
  rotationExpiresAt?: string;
}

/** A discover result enriched with preference-based match scoring. */
export interface ScoredDiscoverResult extends DiscoverResult {
  /** Match percentage (0–100) based on user genre preferences. */
  matchPercentage: number;
  /** Brief explanation of why this is a match, e.g. "Action, Sci-Fi". */
  matchReason: string;
}

/** A movie from the user's watch history suggested for rewatching. */
export interface RewatchSuggestion {
  id: number;
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number | null;
  /** ELO score from media_scores, null if not yet rated. */
  eloScore: number | null;
  /** Effective score used for ranking (ELO or voteAverage fallback). */
  score: number;
  /** Always true — rewatch suggestions are from the user's library. */
  inLibrary: true;
}

/**
 * Standard TMDB genre ID → name mapping.
 * @see https://developer.themoviedb.org/reference/genre-movie-list
 */
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};
