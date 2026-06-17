import { z } from 'zod';

export const ScopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
