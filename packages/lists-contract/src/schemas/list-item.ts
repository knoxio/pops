import { z } from 'zod';

export const ListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  completed: z.boolean(),
  lastEditedTime: z.string().datetime(),
});
