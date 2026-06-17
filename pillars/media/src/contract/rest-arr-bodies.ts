/**
 * Request-body + query zod schemas shared by the arr sub-router route maps
 * (`rest-arr-radarr.ts`, `rest-arr-sonarr.ts`). Split out so each route map
 * stays within the per-file line cap.
 */
import { z } from 'zod';

import { ArrTestResultSchema } from './rest-arr-schemas.js';

export const TestConnectionBody = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});

export const MonitoringBody = z.object({ monitored: z.boolean() });

export const AddMovieBody = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string().min(1),
  year: z.number().int().positive(),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1),
});

export const AddSeriesBody = z.object({
  tvdbId: z.number().int().positive(),
  title: z.string().min(1),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1),
  languageProfileId: z.number().int().positive(),
  seasons: z.array(
    z.object({
      seasonNumber: z.number().int().min(0),
      monitored: z.boolean(),
    })
  ),
});

export const EpisodeMonitoringBody = z.object({
  episodeIds: z.array(z.number().int().positive()).min(1),
  monitored: z.boolean(),
});

export const DownloadAndProtectBody = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string().min(1),
  year: z.number().int().positive(),
});

export const CalendarQuery = z.object({
  start: z.string().date(),
  end: z.string().date(),
});

export const SeasonNumberQuery = z.object({
  seasonNumber: z.coerce.number().int().min(0).optional(),
});

export const TestResult = z.object({ data: ArrTestResultSchema, message: z.string().optional() });
export const MessageBody = z.object({ message: z.string() });
