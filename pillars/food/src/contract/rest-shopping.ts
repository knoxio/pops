/**
 * `shopping.*` sub-router — PRD-152 shopping-list generation from a meal
 * plan. `preview` computes the buy-list (pantry-subtracted, sectioned);
 * `generate` writes it to the lists pillar over REST (reuses the
 * send-to-list ListsClient). Both are POST-with-body (date-range compute).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const CanonicalUnit = z.enum(['g', 'ml', 'count']);

const GeneratorItemSchema = z.object({
  ingredientId: z.number().int(),
  ingredientName: z.string(),
  variantId: z.number().int().nullable(),
  variantName: z.string().nullable(),
  needQty: z.number(),
  pantryQty: z.number(),
  buyQty: z.number(),
  canonicalUnit: CanonicalUnit,
  isUnconverted: z.boolean(),
  originalQty: z.number().nullable(),
  originalUnit: z.string().nullable(),
  sourceLineIds: z.array(z.number().int()),
});

const GeneratorSectionSchema = z.object({
  sectionTag: z.string().nullable(),
  sectionLabel: z.string(),
  items: z.array(GeneratorItemSchema),
});

const GeneratorPreviewSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  planEntryCount: z.number().int(),
  skippedPlanEntryCount: z.number().int(),
  sections: z.array(GeneratorSectionSchema),
  uncategorisedIngredientIds: z.array(z.number().int()),
  recipeTitles: z.array(z.string()),
});

const GenerateResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), listId: z.number().int(), itemCount: z.number().int() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['BadDateRange', 'NoPlanEntries', 'ListNameEmpty', 'BulkAddFailed']),
  }),
]);

export const foodShoppingContract = c.router({
  preview: {
    method: 'POST',
    path: '/shopping/preview',
    body: z.object({ startDate: IsoDate, endDate: IsoDate }),
    responses: {
      200: GeneratorPreviewSchema,
      400: z.object({ message: z.string(), code: z.string().optional() }),
    },
    summary: 'Preview the shopping list a plan range would generate',
  },
  generate: {
    method: 'POST',
    path: '/shopping/generate',
    body: z.object({ startDate: IsoDate, endDate: IsoDate, listName: z.string() }),
    responses: { 200: GenerateResultSchema },
    summary: 'Generate a shopping list from a plan range (writes to lists)',
  },
});
