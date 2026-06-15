import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
