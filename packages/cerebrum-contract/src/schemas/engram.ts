import { z } from 'zod';

export const EngramSchema = z.object({
  id: z.string(),
  content: z.string(),
  lastEditedTime: z.string().datetime(),
});
