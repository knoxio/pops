/**
 * PRD-130 — zod schema for the LLM JSON output (vision + text-fallback).
 *
 * Local copy until PRD-132's `extractedRecipeSchema` lands and PRD-130
 * can dedupe. The shape matches PRD-128's schema exactly so swapping is
 * a one-import change.
 */
import { z } from 'zod';

export const ingredientSchema = z.object({
  ingredient_slug: z.string().min(1),
  variant_slug: z.string().nullable().optional(),
  prep_state_slug: z.string().nullable().optional(),
  qty: z.number().nonnegative(),
  unit: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const stepSchema = z.object({
  body: z.string().min(1),
  duration_min: z.number().nonnegative().nullable().optional(),
  temperature_c: z.number().nullable().optional(),
});

export const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  servings: z.number().int().positive().nullable().optional(),
  prep_time_min: z.number().nonnegative().nullable().optional(),
  cook_time_min: z.number().nonnegative().nullable().optional(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
});

export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;
export type ExtractedIngredient = z.infer<typeof ingredientSchema>;
export type ExtractedStep = z.infer<typeof stepSchema>;
