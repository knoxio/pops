/**
 * PRD-128 — zod schema for the Claude-extracted recipe JSON.
 *
 * Scoped to the web-llm handler to avoid colliding with PRD-132's
 * concurrent `extracted-recipe.ts` (same shape, parallel branches —
 * post-merge dedup task is in the roadmap claim). The schema is strict
 * about required fields and lenient about strings (any plain-text unit
 * is accepted; alias reconciliation happens in the review queue).
 */
import { z } from 'zod';

export const CURATED_PREP_STATES = [
  'whole',
  'diced',
  'sliced',
  'chopped',
  'shredded',
  'minced',
  'julienned',
  'grated',
  'crushed',
  'zested',
  'juiced',
  'melted',
  'softened',
  'mashed',
  'roughly-chopped',
] as const;

export type CuratedPrepState = (typeof CURATED_PREP_STATES)[number];

const ingredientSchema = z.object({
  qty: z.number().positive(),
  unit: z.string().min(1),
  ingredient_slug: z.string().min(1),
  variant_slug: z.string().optional(),
  prep_state_slug: z.string().optional(),
  original_text: z.string().optional(),
  optional: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const stepSchema = z.object({
  body: z.string().min(1),
  duration_minutes: z.number().nonnegative().optional(),
});

export const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  servings: z.number().positive(),
  prep_time_minutes: z.number().nonnegative().optional(),
  cook_time_minutes: z.number().nonnegative().optional(),
  yield_slug: z.string().min(1),
  yield_qty: z.number().positive(),
  yield_unit: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
});

export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;
export type ExtractedIngredient = z.infer<typeof ingredientSchema>;
export type ExtractedStep = z.infer<typeof stepSchema>;

export function isCuratedPrepState(value: string): value is CuratedPrepState {
  return (CURATED_PREP_STATES as readonly string[]).includes(value);
}
