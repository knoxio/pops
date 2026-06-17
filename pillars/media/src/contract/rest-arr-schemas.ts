/**
 * Wire response schemas for the `arr.*` sub-router, split from `rest-arr.ts`
 * to keep both files within the per-file line cap.
 *
 * These mirror the Radarr/Sonarr client return types (see
 * `src/api/clients/arr/types.ts`) — they describe the ACTUAL bytes the
 * handlers serve, not the upstream *arr API shapes verbatim.
 */
import { z } from 'zod';

export const ArrStatusSchema = z.enum([
  'available',
  'monitored',
  'downloading',
  'unmonitored',
  'complete',
  'partial',
  'not_found',
  'unavailable',
]);

export const ArrStatusResultSchema = z.object({
  status: ArrStatusSchema,
  label: z.string(),
  progress: z.number().optional(),
  episodeStats: z.string().optional(),
});

export const ArrConfigSchema = z.object({
  radarrConfigured: z.boolean(),
  sonarrConfigured: z.boolean(),
});

/** Env-derived, read-only settings projection (no key values are returned). */
export const ArrSettingsSchema = z.object({
  radarrUrl: z.string(),
  radarrConfigured: z.boolean(),
  sonarrUrl: z.string(),
  sonarrConfigured: z.boolean(),
});

export const ArrTestResultSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  error: z.string().optional(),
  version: z.string().optional(),
  appName: z.string().optional(),
});

export const DownloadQueueItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  mediaType: z.enum(['movie', 'episode']),
  episodeLabel: z.string().optional(),
  progress: z.number(),
  eta: z.string().optional(),
  source: z.enum(['radarr', 'sonarr']),
});

export const ProfileSchema = z.object({ id: z.number(), name: z.string() });

export const RootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
  freeSpace: z.number(),
});

export const RadarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  tmdbId: z.number(),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  sizeOnDisk: z.number().optional(),
});

export const RadarrCheckResultSchema = z.object({
  exists: z.boolean(),
  radarrId: z.number().optional(),
  monitored: z.boolean().optional(),
});

export const ArrCommandResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
});

const SeriesStatisticsSchema = z.object({
  episodeFileCount: z.number(),
  episodeCount: z.number(),
  totalEpisodeCount: z.number(),
  percentOfEpisodes: z.number(),
});

const SonarrSeasonSchema = z.object({
  seasonNumber: z.number(),
  monitored: z.boolean(),
  statistics: SeriesStatisticsSchema.optional(),
});

export const SonarrSeriesFullSchema = z.object({
  id: z.number(),
  title: z.string(),
  tvdbId: z.number(),
  monitored: z.boolean(),
  statistics: SeriesStatisticsSchema,
  seasons: z.array(SonarrSeasonSchema),
});

export const SonarrEpisodeSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: z.string(),
  monitored: z.boolean(),
  hasFile: z.boolean(),
});

export const SonarrCheckResultSchema = z.object({
  exists: z.boolean(),
  sonarrId: z.number().optional(),
  monitored: z.boolean().optional(),
  seasons: z.array(z.object({ seasonNumber: z.number(), monitored: z.boolean() })).optional(),
});

export const CalendarEpisodeSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  seriesTitle: z.string(),
  tvdbId: z.number(),
  episodeTitle: z.string(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  airDateUtc: z.string(),
  hasFile: z.boolean(),
  posterUrl: z.string().nullable(),
});

export const DownloadAndProtectResultSchema = z.object({
  alreadyInRadarr: z.boolean(),
});
