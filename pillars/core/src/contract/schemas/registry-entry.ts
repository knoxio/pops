import { z } from 'zod';

export const RegistryEntrySchema = z.object({
  pillarId: z.string(),
  baseUrl: z.string(),
  registeredAt: z.string().datetime(),
});
