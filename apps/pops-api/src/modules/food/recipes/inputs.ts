/**
 * Zod input schemas for `food.recipes.*` — PRD-119.
 *
 * Stable references — tests import these alongside the router so the
 * boundary contract is exercised, not invented.
 */
import { z } from 'zod';

import { RecipeTypeSchema, SortOrderSchema } from './types.js';

export const ListInputSchema = z.object({
  search: z.string().max(200).optional(),
  recipeTypes: z.array(RecipeTypeSchema).optional(),
  tags: z.array(z.string().min(1)).optional(),
  includeArchived: z.boolean().optional(),
  includeDraftOnly: z.boolean().optional(),
  sort: SortOrderSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const GetForRenderingInputSchema = z.object({
  slug: z.string().min(1),
  versionNo: z.number().int().positive().optional(),
});

export const CreateInputSchema = z.object({
  dsl: z.string().min(1),
});

export const CreateNewDraftInputSchema = z.object({
  slug: z.string().min(1),
});

export const SaveDraftInputSchema = z.object({
  versionId: z.number().int().positive(),
  dsl: z.string().min(1),
});

export const VersionIdInputSchema = z.object({
  versionId: z.number().int().positive(),
});

export const RecipeSlugInputSchema = z.object({
  slug: z.string().min(1),
});

export const ListDraftsInputSchema = z.object({
  slug: z.string().min(1),
});

export const RestoreVersionInputSchema = z.object({
  sourceVersionId: z.number().int().positive(),
});

export const ListProposedSlugsInputSchema = z.object({
  versionId: z.number().int().positive(),
});
