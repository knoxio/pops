import { z } from 'zod';

export const IngredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  unit: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
