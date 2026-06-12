import { z } from 'zod';

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  servings: z.number().nullable(),
  lastEditedTime: z.string().datetime(),
});
