/**
 * Wire-shape interfaces, row→wire mappers, and pure confidence math for the
 * comparisons domain. Mirrors the monolith `types-domain.ts` exactly so the
 * REST cutover is transparent to the frontend.
 */
import type { ComparisonDimensionRow, ComparisonRow, MediaScoreRow } from '../../row-types.js';

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const DRAW_TIERS = ['high', 'mid', 'low'] as const;
export type DrawTier = (typeof DRAW_TIERS)[number];
export const COMPARISON_SOURCES = ['arena', 'tier_list'] as const;
export type ComparisonSource = (typeof COMPARISON_SOURCES)[number];

const TIER_RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIER_RANKS)[number];
export { TIER_RANKS };

/** Tier rank ordering — lower index = higher tier. */
export const TIER_RANK_ORDER: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

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
  source: string | null;
  deltaA: number | null;
  deltaB: number | null;
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
    source: row.source ?? null,
    deltaA: row.deltaA ?? null,
    deltaB: row.deltaB ?? null,
    comparedAt: row.comparedAt,
  };
}

/** Per-dimension confidence (0–1) from how many comparisons a media item has had. */
export function calculateConfidence(comparisonCount: number): number {
  return 1 - 1 / Math.sqrt(comparisonCount + 1);
}

/** Overall confidence (0–1) from dimension coverage and depth. */
export function calculateOverallConfidence(
  perDimensionCounts: number[],
  totalActiveDimensions: number
): number {
  if (totalActiveDimensions === 0) return 0;
  const scored = perDimensionCounts.filter((c) => c > 0);
  if (scored.length === 0) return 0;
  const coverageRatio = scored.length / totalActiveDimensions;
  const avgDepth = scored.reduce((sum, c) => sum + calculateConfidence(c), 0) / scored.length;
  return coverageRatio * avgDepth;
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
  excluded: boolean;
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
    excluded: row.excluded === 1,
    updatedAt: row.updatedAt,
  };
}

/** A movie in a random/smart comparison pair. */
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

/** A smart pair — includes the auto-selected dimension. */
export interface SmartPairResult extends RandomPair {
  dimensionId: number;
}

/** A ranked media entry. */
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

export interface BlacklistMovieResult {
  blacklistedCount: number;
  comparisonsDeleted: number;
  dimensionsRecalculated: number;
}

/** A movie in a tier-list placement round. */
export interface TierListMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  tierOverride: string | null;
}

export interface ScoreChange {
  movieId: number;
  oldScore: number;
  newScore: number;
}

export interface SubmitTierListResult {
  comparisonsRecorded: number;
  skipped: number;
  scoreChanges: ScoreChange[];
}

export interface BatchRecordResult {
  count: number;
  skipped: number;
}

export interface RecordComparisonInput {
  dimensionId: number;
  mediaAType: MediaType;
  mediaAId: number;
  mediaBType: MediaType;
  mediaBId: number;
  winnerType: MediaType;
  winnerId: number;
  drawTier?: DrawTier | null;
  source?: ComparisonSource | null;
}

export interface BatchComparisonItem {
  mediaAType: MediaType;
  mediaAId: number;
  mediaBType: MediaType;
  mediaBId: number;
  winnerType: MediaType;
  winnerId: number;
  drawTier?: DrawTier | null;
}

export interface CreateDimensionInput {
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
  weight?: number;
}

export interface UpdateDimensionInput {
  name?: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
  weight?: number;
}

export interface TierPlacement {
  movieId: number;
  tier: Tier;
}

export interface SubmitTierListInput {
  dimensionId: number;
  placements: TierPlacement[];
}
