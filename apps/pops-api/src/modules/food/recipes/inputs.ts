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

/**
 * PRD-142 — `food.recipes.prepareSendToList` (query).
 */
export const PrepareSendToListInputSchema = z.object({
  versionId: z.number().int().positive(),
  scaleFactor: z.number().positive().optional(),
});

/**
 * PRD-142 — `food.recipes.sendToList` (mutation). Target is a discriminated
 * union: existing list (by id) or a brand-new shopping list (by name).
 */
export const SendToListInputSchema = z.object({
  versionId: z.number().int().positive(),
  scaleFactor: z.number().positive().optional(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('existing'), listId: z.number().int().positive() }),
    z.object({ kind: z.literal('new'), name: z.string().min(1) }),
  ]),
});
