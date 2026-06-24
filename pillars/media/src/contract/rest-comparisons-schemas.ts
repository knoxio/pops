/**
 * Wire request/response schemas for the `comparisons.*` REST sub-router —
 * split from `rest-comparisons.ts` to keep both within the per-file line cap.
 * All shapes are flat (no recursive `z.lazy`).
 */
import { z } from 'zod';

const MEDIA_TYPES = ['movie', 'tv_show'] as const;
const DRAW_TIERS = ['high', 'mid', 'low'] as const;
const COMPARISON_SOURCES = ['arena', 'tier_list'] as const;
const TIER_RANKS = ['S', 'A', 'B', 'C', 'D'] as const;

export const DimensionSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number(),
  weight: z.number(),
  createdAt: z.string(),
});

export const ComparisonSchema = z.object({
  id: z.number(),
  dimensionId: z.number(),
  mediaAType: z.string(),
  mediaAId: z.number(),
  mediaBType: z.string(),
  mediaBId: z.number(),
  winnerType: z.string(),
  winnerId: z.number(),
  drawTier: z.string().nullable(),
  source: z.string().nullable(),
  deltaA: z.number().nullable(),
  deltaB: z.number().nullable(),
  comparedAt: z.string(),
});

export const MediaScoreSchema = z.object({
  id: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  dimensionId: z.number(),
  score: z.number(),
  comparisonCount: z.number(),
  confidence: z.number(),
  excluded: z.boolean(),
  updatedAt: z.string(),
});

export const RankedMediaEntrySchema = z.object({
  rank: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  score: z.number(),
  comparisonCount: z.number(),
  confidence: z.number(),
});

const RandomPairMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
});

export const SmartPairSchema = z.object({
  movieA: RandomPairMovieSchema,
  movieB: RandomPairMovieSchema,
  dimensionId: z.number(),
});

export const TierListMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  posterUrl: z.string().nullable(),
  score: z.number(),
  comparisonCount: z.number(),
  tierOverride: z.string().nullable(),
});

export const ScoreChangeSchema = z.object({
  movieId: z.number(),
  oldScore: z.number(),
  newScore: z.number(),
});

export const SubmitTierListResultSchema = z.object({
  comparisonsRecorded: z.number(),
  skipped: z.number(),
  scoreChanges: z.array(ScoreChangeSchema),
});

export const BlacklistMovieResultSchema = z.object({
  blacklistedCount: z.number(),
  comparisonsDeleted: z.number(),
  dimensionsRecalculated: z.number(),
});

export const BatchRecordResultSchema = z.object({
  count: z.number(),
  skipped: z.number(),
});

// ── inputs ──

export const CreateDimensionBody = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  weight: z.number().min(0.1).max(10).optional().default(1.0),
});

export const UpdateDimensionBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  weight: z.number().min(0.1).max(10).optional(),
});

export const RecordComparisonBody = z.object({
  dimensionId: z.number().int().positive(),
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
  winnerType: z.enum(MEDIA_TYPES),
  winnerId: z.number().int().nonnegative(),
  drawTier: z.enum(DRAW_TIERS).nullable().optional(),
  source: z.enum(COMPARISON_SOURCES).nullable().optional(),
});

export const ListForMediaQuery = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.coerce.number().int().positive(),
  dimensionId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const ListAllQuery = z.object({
  dimensionId: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const BlacklistMovieBody = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
});

const BatchComparisonItemSchema = z.object({
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
  winnerType: z.enum(MEDIA_TYPES),
  winnerId: z.number().int().nonnegative(),
  drawTier: z.enum(DRAW_TIERS).nullable().optional(),
});

export const BatchRecordBody = z.object({
  dimensionId: z.number().int().positive(),
  comparisons: z.array(BatchComparisonItemSchema).min(1, 'At least 1 comparison is required'),
});

export const RecordSkipBody = z.object({
  dimensionId: z.number().int().positive(),
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
});

export const SmartPairQuery = z.object({
  dimensionId: z.coerce.number().int().positive().optional(),
});

export const ScoresQuery = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.coerce.number().int().positive(),
  dimensionId: z.coerce.number().int().positive().optional(),
});

export const RankingsQuery = z.object({
  dimensionId: z.coerce.number().int().positive().optional(),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const DimensionExclusionBody = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
});

export const StalenessBody = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
});

export const StalenessQuery = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.coerce.number().int().positive(),
});

const TierPlacementSchema = z.object({
  movieId: z.number().int().positive(),
  tier: z.enum(TIER_RANKS),
});

export const SubmitTierListBody = z.object({
  dimensionId: z.number().int().positive(),
  placements: z.array(TierPlacementSchema).min(2, 'At least 2 placements are required'),
});
