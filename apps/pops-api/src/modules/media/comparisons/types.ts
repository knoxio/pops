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
  createdAt: string;
}

export function toDimension(row: ComparisonDimensionRow): Dimension {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active === 1,
    sortOrder: row.sortOrder,
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
    comparedAt: row.comparedAt,
  };
}

/** API response shape for a media score. */
export interface MediaScore {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  score: number;
  comparisonCount: number;
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
    updatedAt: row.updatedAt,
  };
}

/** Zod schemas */
export const CreateDimensionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});
export type CreateDimensionInput = z.infer<typeof CreateDimensionSchema>;

export const UpdateDimensionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateDimensionInput = z.infer<typeof UpdateDimensionSchema>;

export const RecordComparisonSchema = z.object({
  dimensionId: z.number().int().positive(),
  mediaAType: z.enum(MEDIA_TYPES),
  mediaAId: z.number().int().positive(),
  mediaBType: z.enum(MEDIA_TYPES),
  mediaBId: z.number().int().positive(),
  winnerType: z.enum(MEDIA_TYPES),
  winnerId: z.number().int().positive(),
});
export type RecordComparisonInput = z.infer<typeof RecordComparisonSchema>;

export const ScoreQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive().optional(),
});
export type ScoreQuery = z.infer<typeof ScoreQuerySchema>;

export const ComparisonQuerySchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  dimensionId: z.number().int().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type ComparisonQuery = z.infer<typeof ComparisonQuerySchema>;
