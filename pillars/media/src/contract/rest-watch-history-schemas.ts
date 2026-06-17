/**
 * Wire response/query schemas for the `watch-history.*` REST sub-router —
 * split from `rest-watch-history.ts` to keep both files within the per-file
 * line cap. Mirror the monolith `toWatchHistoryEntry` mapper + the
 * progress / recent-enrichment handler output shapes exactly.
 */
import { z } from 'zod';

/** Passthrough entry shape served by `list` / `get` / `log`. Mirrors `toWatchHistoryEntry`. */
export const WatchHistoryEntrySchema = z.object({
  id: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  watchedAt: z.string(),
  completed: z.number(),
});

/** Enriched entry served by `listRecent`. */
export const RecentWatchHistoryEntrySchema = z.object({
  id: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  watchedAt: z.string(),
  completed: z.number(),
  title: z.string().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  seasonNumber: z.number().nullable(),
  episodeNumber: z.number().nullable(),
  showName: z.string().nullable(),
  tvShowId: z.number().nullable(),
});

export const SeasonProgressSchema = z.object({
  seasonId: z.number(),
  seasonNumber: z.number(),
  watched: z.number(),
  total: z.number(),
  percentage: z.number(),
});

export const NextEpisodeSchema = z.object({
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  episodeName: z.string().nullable(),
});

export const TvShowProgressSchema = z.object({
  tvShowId: z.number(),
  overall: z.object({ watched: z.number(), total: z.number(), percentage: z.number() }),
  seasons: z.array(SeasonProgressSchema),
  nextEpisode: NextEpisodeSchema.nullable(),
});

export const BatchProgressEntrySchema = z.object({
  tvShowId: z.number(),
  percentage: z.number(),
});

export const BatchLogResultSchema = z.object({
  logged: z.number(),
  skipped: z.number(),
});

const WATCH_MEDIA_TYPES = ['movie', 'episode'] as const;

export const WatchHistoryQuery = z.object({
  mediaType: z.enum(WATCH_MEDIA_TYPES).optional(),
  mediaId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

export const RecentWatchHistoryQuery = z.object({
  mediaType: z.enum(WATCH_MEDIA_TYPES).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

/**
 * `batch-progress` body. The monolith took `{ tvShowIds: number[] }` (up to
 * 500). Served as POST with a JSON body rather than a repeated query param so
 * the array arrives cleanly typed (no `string | string[]` qs ambiguity) and
 * large id batches don't bump the URL length limit.
 */
export const BatchProgressBody = z.object({
  tvShowIds: z.array(z.number().int().positive()).min(1).max(500),
});

export const LogWatchBody = z.object({
  mediaType: z.enum(WATCH_MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  watchedAt: z.string().datetime().optional(),
  completed: z.number().int().min(0).max(1).optional().default(1),
  source: z.enum(['manual', 'plex_sync']).optional().default('manual'),
});

const BATCH_MEDIA_TYPES = ['season', 'show'] as const;

export const BatchLogWatchBody = z.object({
  mediaType: z.enum(BATCH_MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  watchedAt: z.string().datetime().optional(),
  completed: z.number().int().min(0).max(1).optional().default(1),
});
