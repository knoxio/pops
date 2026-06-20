import { z } from 'zod';

export const TvShowSchema = z.object({
  id: z.string(),
  title: z.string(),
  tmdbId: z.string().nullable(),
  tvdbId: z.string().nullable(),
  seasonCount: z.number().int().nonnegative().nullable(),
  lastEditedTime: z.string().datetime(),
});
