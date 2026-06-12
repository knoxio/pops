import { z } from 'zod';

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  ingredients: z.array(z.string()).readonly(),
  instructions: z.string(),
  tagIds: z.array(z.string()).readonly(),
  source: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
