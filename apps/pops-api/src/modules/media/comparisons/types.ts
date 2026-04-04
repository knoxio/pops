import { z } from "zod";
import type { ComparisonDimensionRow, ComparisonRow, MediaScoreRow } from "@pops/db-types";

export type { ComparisonDimensionRow, ComparisonRow, MediaScoreRow };

const MEDIA_TYPES = ["movie", "tv_show"] as const;

/** API response shape for a dimension. */
export interface Dimension {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  weight: number;
  createdAt: string;
}

export function toDimension(row: ComparisonDimensionRow): Dimension {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active === 1,
    sortOrder: row.sortOrder,
    weight: row.weight ?? 1.0,
    createdAt: row.createdAt,
  };
}

/** API response shape for a comparison. */
export interface Comparison {
  id: number;
  dimensionId: number;
  mediaAType: string;
  mediaAId: number;
  mediaBType: string;
  mediaBId: number;
  winnerType: string;
  winnerId: number;
  drawTier: string | null;
  comparedAt: string;
}

export function toComparison(row: ComparisonRow): Comparison {
  return {
    id: row.id,
    dimensionId: row.dimensionId,
    mediaAType: row.mediaAType,
    mediaAId: row.mediaAId,
    mediaBType: row.mediaBType,
    mediaBId: row.mediaBId,
    winnerType: row.winnerType,
    winnerId: row.winnerId,
    drawTier: row.drawTier,
    comparedAt: row.comparedAt,
  };
}

/**
 * Derive confidence (0–1) from how many comparisons a media item has undergone.
 * Formula: 1 - (1 / sqrt(comparisonCount + 1))
 * At 0 comparisons → 0, at 1 → ~0.29, at 3 → ~0.5, at 30 → ~0.82.
 */
export function calculateConfidence(comparisonCount: number): number {
  return 1 - 1 / Math.sqrt(comparisonCount + 1);
}

/** API response shape for a media score. */
export interface MediaScore {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  score: number;
  comparisonCount: number;
  confidence: number;
  updatedAt: string;
}

export function toMediaScore(row: MediaScoreRow): MediaScore {
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    dimensionId: row.dimensionId,
    score: row.score,
    comparisonCount: row.comparisonCount,
    confidence: calculateConfidence(row.comparisonCount),
    updatedAt: row.updatedAt,
  };
}

/** API response shape for a random pair of movies to compare. */
export interface RandomPairMovie {
  id: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
}

export interface RandomPair {
  movieA: RandomPairMovie;
  movieB: RandomPairMovie;
}

/** Zod schema for getRandomPair query. */
export const RandomPairQuerySchema = z.object({
  dimensionId: z.number().int().positive(),
  avoidRecent: z.coerce.number().int().nonnegative().max(100).optional().default(10),
});
export type RandomPairQuery = z.infer<typeof RandomPairQuerySchema>;

/** Zod schema for getSmartPair query. */
export const SmartPairQuerySchema = z.object({
  dimensionId: z.number().int().positive().optional(),
});
export type SmartPairQuery = z.infer<typeof SmartPairQuerySchema>;

/** Zod schemas */
export const CreateDimensionSchema = z.object({
  name: z.string().min(1, "Name is required"),
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

const DRAW_TIERS = ["high", "mid", "low"] as const;
export type DrawTier = (typeof DRAW_TIERS)[number];

export const RecordComparisonSchema = z.object({
  dimensionId: z.number().int().positive(),
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
  winnerType: z.enum(MEDIA_TYPES),
  winnerId: z.number().int().nonnegative(), // 0 = draw
  drawTier: z.enum(DRAW_TIERS).nullable().optional(),
});
export type RecordComparisonInput = z.infer<typeof RecordComparisonSchema>;

export const ScoreQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive().optional(),
});
export type ScoreQuery = z.infer<typeof ScoreQuerySchema>;

/** API response shape for a ranked media entry. */
export interface RankedMediaEntry {
  rank: number;
  mediaType: string;
  mediaId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  confidence: number;
}

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

export interface BlacklistMovieResult {
  blacklistedCount: number;
  comparisonsDeleted: number;
  dimensionsRecalculated: number;
}

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

/** API response shape for a debrief opponent. */
export interface DebriefOpponent {
  id: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
}

/** API response shape for a pending debrief entry. */
export interface PendingDebrief {
  sessionId: number;
  movieId: number;
  title: string;
  posterUrl: string | null;
  status: "pending" | "active";
  createdAt: string;
  pendingDimensionCount: number;
}

export const GetDebriefSchema = z.object({
  sessionId: z.number().int().positive(),
});
export type GetDebriefInput = z.infer<typeof GetDebriefSchema>;

export const GetTierListMoviesSchema = z.object({
  dimensionId: z.number().int().positive(),
});
export type GetTierListMoviesInput = z.infer<typeof GetTierListMoviesSchema>;

/** API response shape for a movie in a tier list placement round. */
export interface TierListMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

const TIER_RANKS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIER_RANKS)[number];

export const TierPlacementSchema = z.object({
  movieId: z.number().int().positive(),
  tier: z.enum(TIER_RANKS),
});

export const SubmitTierListSchema = z.object({
  dimensionId: z.number().int().positive(),
  placements: z.array(TierPlacementSchema).min(2, "At least 2 placements are required"),
});
export type SubmitTierListInput = z.infer<typeof SubmitTierListSchema>;

export interface ScoreChange {
  movieId: number;
  oldScore: number;
  newScore: number;
}

export interface SubmitTierListResult {
  comparisonsRecorded: number;
  scoreChanges: ScoreChange[];
}

/** Tier rank ordering — lower index = higher tier. */
export const TIER_RANK_ORDER: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
