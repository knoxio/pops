import { z } from 'zod';

export const EngramSchema = z.object({
  id: z.string(),
  content: z.string(),
  parentId: z.string().nullable(),
  tagIds: z.array(z.string()).readonly(),
  scopeId: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastEditedTime: z.string().datetime(),
});
