import { z } from 'zod';

export const ConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  lastEditedTime: z.string().datetime(),
});
