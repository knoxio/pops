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
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  popularity: number;
  /** Whether this movie is already in the user's library. */
  inLibrary: boolean;
}
