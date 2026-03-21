import { z } from "zod";
import type { WatchHistoryRow } from "@pops/db-types";

export type { WatchHistoryRow };

const WATCH_MEDIA_TYPES = ["movie", "episode"] as const;

/** API response shape for a watch history entry. */
export interface WatchHistoryEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  watchedAt: string;
  completed: number;
}

/** Map a SQLite row to the API response shape. */
export function toWatchHistoryEntry(row: WatchHistoryRow): WatchHistoryEntry {
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    watchedAt: row.watchedAt,
    completed: row.completed,
  };
}

/** Zod schema for logging a watch event. */
export const LogWatchSchema = z.object({
  mediaType: z.enum(WATCH_MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  watchedAt: z.string().datetime().optional(),
  completed: z.number().int().min(0).max(1).optional().default(1),
});
export type LogWatchInput = z.infer<typeof LogWatchSchema>;

/** Zod schema for watch history list query params. */
export const WatchHistoryQuerySchema = z.object({
  mediaType: z.enum(WATCH_MEDIA_TYPES).optional(),
  mediaId: z.number().int().positive().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type WatchHistoryQueryRaw = z.infer<typeof WatchHistoryQuerySchema>;

/** Zod schema for batch-logging watch events (whole season or show). */
const BATCH_MEDIA_TYPES = ["season", "show"] as const;

export const BatchLogWatchSchema = z.object({
  mediaType: z.enum(BATCH_MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  watchedAt: z.string().datetime().optional(),
  completed: z.number().int().min(0).max(1).optional().default(1),
});
export type BatchLogWatchInput = z.infer<typeof BatchLogWatchSchema>;

/** Parsed filter params passed to the service layer. */
export interface WatchHistoryFilters {
  mediaType?: string;
  mediaId?: number;
}

/** Zod schema for getProgress input. */
export const ProgressQuerySchema = z.object({
  tvShowId: z.number().int().positive(),
});

/** Progress for a single season. */
export interface SeasonProgress {
  seasonId: number;
  seasonNumber: number;
  watched: number;
  total: number;
  percentage: number;
}

/** Overall + per-season watch progress for a TV show. */
export interface TvShowProgress {
  tvShowId: number;
  overall: {
    watched: number;
    total: number;
    percentage: number;
  };
  seasons: SeasonProgress[];
}
