import { z } from 'zod';

import { MEAL_TYPES } from '../types/meal-plan.js';

export const MealTypeSchema = z.enum(MEAL_TYPES);

export const MealPlanSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  mealType: MealTypeSchema,
  recipeId: z.string().nullable(),
  notes: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
