import { z } from 'zod';

export const TransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  date: z.string().datetime(),
  entityId: z.string().nullable(),
  tagIds: z.array(z.string()).readonly(),
  lastEditedTime: z.string().datetime(),
});
