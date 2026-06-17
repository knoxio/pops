import { z } from 'zod';

export const MovieSchema = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  tmdbId: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
