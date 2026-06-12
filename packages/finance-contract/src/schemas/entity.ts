import { z } from 'zod';

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).readonly(),
  lastEditedTime: z.string().datetime(),
});
