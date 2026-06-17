/**
 * Zod building blocks for the `discovery.*` REST contract.
 *
 * Split from `rest-discovery.ts` so the route map stays focused. Zod-only — no
 * imports from `src/api/` or `src/db/`, honouring the package boundary. Wire
 * shapes mirror the legacy `media.discovery.*` tRPC procedures.
 */
import { z } from 'zod';

/** A discover result item — the shared row shape across every discover list. */
export const DiscoverResultSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  overview: z.string(),
  releaseDate: z.string(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropPath: z.string().nullable(),
  voteAverage: z.number(),
  voteCount: z.number(),
  genreIds: z.array(z.number()),
  popularity: z.number(),
  inLibrary: z.boolean(),
  isWatched: z.boolean(),
  onWatchlist: z.boolean(),
  rotationExpiresAt: z.string().optional(),
});

/** A discover result with preference-based match scoring. */
export const ScoredDiscoverResultSchema = DiscoverResultSchema.extend({
  matchPercentage: z.number(),
  matchReason: z.string(),
});

export const GenreAffinitySchema = z.object({
  genre: z.string(),
  avgScore: z.number(),
  movieCount: z.number(),
  totalComparisons: z.number(),
});

export const DimensionWeightSchema = z.object({
  dimensionId: z.number(),
  name: z.string(),
  comparisonCount: z.number(),
  avgScore: z.number(),
});

export const GenreDistributionSchema = z.object({
  genre: z.string(),
  watchCount: z.number(),
  percentage: z.number(),
});

export const PreferenceProfileSchema = z.object({
  genreAffinities: z.array(GenreAffinitySchema),
  dimensionWeights: z.array(DimensionWeightSchema),
  genreDistribution: z.array(GenreDistributionSchema),
  totalMoviesWatched: z.number(),
  totalComparisons: z.number(),
});

export const QuickPickMovieSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  releaseDate: z.string().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropPath: z.string().nullable(),
  overview: z.string().nullable(),
  voteAverage: z.number().nullable(),
  genres: z.string(),
  runtime: z.number().nullable(),
});

export const DismissBody = z.object({ tmdbId: z.number().int().positive() });

export const QuickPickQuery = z.object({
  count: z.coerce.number().int().positive().max(10).optional(),
});

export const TrendingQuery = z.object({
  timeWindow: z.enum(['day', 'week']).optional(),
  page: z.coerce.number().int().positive().max(500).optional(),
});

export const RecommendationsQuery = z.object({
  sampleSize: z.coerce.number().int().positive().max(10).optional(),
});

export const TrendingResultSchema = z.object({
  results: z.array(DiscoverResultSchema),
  totalResults: z.number(),
  page: z.number(),
});

export const RecommendationsResultSchema = z.object({
  results: z.array(ScoredDiscoverResultSchema),
  sourceMovies: z.array(z.string()),
  totalComparisons: z.number(),
});

export const WatchlistRecommendationsResultSchema = z.object({
  results: z.array(ScoredDiscoverResultSchema),
  sourceMovies: z.array(z.string()),
});

export const ContextPicksResultSchema = z.object({
  collections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      emoji: z.string(),
      results: z.array(DiscoverResultSchema),
    })
  ),
});

export const GenreSpotlightResultSchema = z.object({
  genres: z.array(
    z.object({
      genreId: z.number(),
      genreName: z.string(),
      results: z.array(ScoredDiscoverResultSchema),
      totalPages: z.number(),
    })
  ),
});

export const GenreSpotlightPageQuery = z.object({
  genreId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(2),
});

export const GenreSpotlightPageResultSchema = z.object({
  genreId: z.number(),
  genreName: z.string(),
  results: z.array(ScoredDiscoverResultSchema),
  page: z.number(),
  totalPages: z.number(),
});

export const AssembledShelfSchema = z.object({
  shelfId: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  emoji: z.string().nullable(),
  pinned: z.boolean(),
  items: z.array(DiscoverResultSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

export const AssembleSessionResultSchema = z.object({
  shelves: z.array(AssembledShelfSchema),
});

export const ShelfPageQuery = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const ShelfPageResultSchema = z.object({
  items: z.array(DiscoverResultSchema),
  hasMore: z.boolean(),
  totalCount: z.number().nullable(),
});

export const RewatchSuggestionSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  releaseDate: z.string().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  voteAverage: z.number().nullable(),
  eloScore: z.number().nullable(),
  score: z.number(),
  inLibrary: z.literal(true),
});
