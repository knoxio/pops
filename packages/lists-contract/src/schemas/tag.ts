import { z } from 'zod';

export const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
