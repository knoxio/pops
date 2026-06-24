/**
 * `solver.*` sub-router — `canICook` ranks cookable recipes by how many
 * substitutions each needs given current batch inventory.
 *
 * Modelled as `POST /solver/can-i-cook` with a JSON body rather than a GET:
 * the filter set is array-shaped (recipeTypes, tags), which rides far more
 * cleanly in a body than in repeated query params. It is still a pure read.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const RecipeType = z.enum([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);

const CanICookBody = z.object({
  excludeSubs: z.boolean().optional(),
  recipeTypes: z.array(RecipeType).max(7).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
  maxMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
});

const SolveSubBreakdownSchema = z.object({
  lineIndex: z.number().int(),
  fromIngredientName: z.string(),
  fromVariantName: z.string().nullable(),
  candidateSubName: z.string(),
  substitutionId: z.number().int(),
});

const SolveRecipeRowSchema = z.object({
  recipeId: z.number().int().positive(),
  recipeSlug: z.string(),
  title: z.string(),
  recipeType: RecipeType.nullable(),
  heroImagePath: z.string().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  lastCookedAt: z.string().nullable(),
  subsNeeded: z.number().int().nonnegative(),
  subs: z.array(SolveSubBreakdownSchema),
});

const SolveResultSchema = z.object({
  totalCandidates: z.number().int().nonnegative(),
  cookableCount: z.number().int().nonnegative(),
  recipes: z.array(SolveRecipeRowSchema),
});

export const foodSolverContract = c.router({
  canICook: {
    method: 'POST',
    path: '/solver/can-i-cook',
    body: CanICookBody,
    responses: { 200: SolveResultSchema },
    summary: 'Rank cookable recipes by substitution count given current inventory',
  },
});
