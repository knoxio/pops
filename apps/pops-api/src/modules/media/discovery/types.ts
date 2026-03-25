/**
 * Discovery / preference profile types and trending/recommendation types.
 */
import { z } from "zod";

export interface GenreAffinity {
  genre: string;
  avgScore: number;
  movieCount: number;
  totalComparisons: number;
}

export interface DimensionWeight {
  dimensionId: number;
  name: string;
  comparisonCount: number;
  avgScore: number;
}

export interface GenreDistribution {
  genre: string;
  watchCount: number;
  percentage: number;
}

export interface PreferenceProfile {
  genreAffinities: GenreAffinity[];
  dimensionWeights: DimensionWeight[];
  genreDistribution: GenreDistribution[];
  totalMoviesWatched: number;
  totalComparisons: number;
}

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

/** Schema for trending query input. */
export const TrendingQuerySchema = z.object({
  timeWindow: z.enum(["day", "week"]).optional().default("week"),
  page: z.number().int().positive().max(500).optional().default(1),
});

/** Schema for recommendations query input. */
export const RecommendationsQuerySchema = z.object({
  /** Number of library movies to sample for recommendations. */
  sampleSize: z.number().int().positive().max(10).optional().default(3),
});

/** A discover result item (from TMDB). */
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
}

/** A discover result enriched with preference-based match scoring. */
export interface ScoredDiscoverResult extends DiscoverResult {
  /** Match percentage (0–100) based on user genre preferences. */
  matchPercentage: number;
  /** Brief explanation of why this is a match, e.g. "Action, Sci-Fi". */
  matchReason: string;
}

/**
 * Standard TMDB genre ID → name mapping.
 * @see https://developer.themoviedb.org/reference/genre-movie-list
 */
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};
