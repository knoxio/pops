import { z } from 'zod';

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortIndex: z.number().int().nonnegative(),
  lastEditedTime: z.string().datetime(),
});
