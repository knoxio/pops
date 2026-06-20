import { z } from 'zod';

export const WarrantySchema = z.object({
  id: z.string(),
  itemId: z.string(),
  expiresAt: z.string().datetime(),
  provider: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
