import { z } from 'zod';

import {
  COMPARISON_SOURCES,
  DRAW_TIERS,
  MEDIA_TYPES,
  TierPlacementSchema,
} from './types-domain.js';

export const RandomPairQuerySchema = z.object({
  dimensionId: z.number().int().positive(),
  avoidRecent: z.coerce.number().int().nonnegative().max(100).optional().default(10),
});
export type RandomPairQuery = z.infer<typeof RandomPairQuerySchema>;

export const SmartPairQuerySchema = z.object({
  dimensionId: z.number().int().positive().optional(),
});
export type SmartPairQuery = z.infer<typeof SmartPairQuerySchema>;

export const CreateDimensionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  weight: z.number().min(0.1).max(10).optional().default(1.0),
});
export type CreateDimensionInput = z.infer<typeof CreateDimensionSchema>;

export const UpdateDimensionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  weight: z.number().min(0.1).max(10).optional(),
});
export type UpdateDimensionInput = z.infer<typeof UpdateDimensionSchema>;

export const RecordComparisonSchema = z.object({
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
export type RecordComparisonInput = z.infer<typeof RecordComparisonSchema>;

export const ScoreQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive().optional(),
});
export type ScoreQuery = z.infer<typeof ScoreQuerySchema>;

export const RankingsQuerySchema = z.object({
  dimensionId: z.number().int().positive().optional(),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type RankingsQuery = z.infer<typeof RankingsQuerySchema>;

export const ComparisonQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type ComparisonQuery = z.infer<typeof ComparisonQuerySchema>;

export const ComparisonHistoryQuerySchema = z.object({
  dimensionId: z.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type ComparisonHistoryQuery = z.infer<typeof ComparisonHistoryQuerySchema>;

export const DeleteComparisonSchema = z.object({
  id: z.number().int().positive(),
});
export type DeleteComparisonInput = z.infer<typeof DeleteComparisonSchema>;

export const BlacklistMovieSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
});
export type BlacklistMovieInput = z.infer<typeof BlacklistMovieSchema>;

export const DimensionExclusionSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
});
export type DimensionExclusionInput = z.infer<typeof DimensionExclusionSchema>;

export const StalenessSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
});
export type StalenessInput = z.infer<typeof StalenessSchema>;

export const RecordSkipSchema = z.object({
  dimensionId: z.number().int().positive(),
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
});
export type RecordSkipInput = z.infer<typeof RecordSkipSchema>;

export const GetDebriefOpponentSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
});
export type GetDebriefOpponentInput = z.infer<typeof GetDebriefOpponentSchema>;

export const DismissDebriefDimensionSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
});
export type DismissDebriefDimensionInput = z.infer<typeof DismissDebriefDimensionSchema>;

export const GetDebriefSchema = z.object({
  mediaType: z.enum(['movie', 'episode']),
  mediaId: z.number().int().positive(),
});
export type GetDebriefInput = z.infer<typeof GetDebriefSchema>;

export const GetTierListMoviesSchema = z.object({
  dimensionId: z.number().int().positive(),
});
export type GetTierListMoviesInput = z.infer<typeof GetTierListMoviesSchema>;

export const SubmitTierListSchema = z.object({
  dimensionId: z.number().int().positive(),
  placements: z.array(TierPlacementSchema).min(2, 'At least 2 placements are required'),
});
export type SubmitTierListInput = z.infer<typeof SubmitTierListSchema>;

export const RecordDebriefComparisonSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
  opponentType: z.enum(MEDIA_TYPES),
  opponentId: z.number().int().positive(),
  winnerId: z.number().int().nonnegative(),
  drawTier: z.enum(DRAW_TIERS).nullable().optional(),
});
export type RecordDebriefComparisonInput = z.infer<typeof RecordDebriefComparisonSchema>;

export const BatchComparisonItemSchema = z.object({
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
  winnerType: z.enum(MEDIA_TYPES),
  winnerId: z.number().int().nonnegative(),
  drawTier: z.enum(DRAW_TIERS).nullable().optional(),
});
export type BatchComparisonItem = z.infer<typeof BatchComparisonItemSchema>;

export const BatchRecordComparisonsSchema = z.object({
  dimensionId: z.number().int().positive(),
  comparisons: z.array(BatchComparisonItemSchema).min(1, 'At least 1 comparison is required'),
});
export type BatchRecordComparisonsInput = z.infer<typeof BatchRecordComparisonsSchema>;
