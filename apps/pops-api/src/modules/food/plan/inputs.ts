/**
 * Input Zod schemas for `food.plan.*` procedures.
 *
 * Shapes match PRD-143. PRD-111's plan-slot service amendments
 * (`addSlot`/`updateSlot`/`deleteSlot`) already shipped — the tRPC
 * surface here adds the matching procedures.
 */

import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const SlugLike = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, 'slug-format');

export const WeekViewInputSchema = z.object({
  weekStart: IsoDate,
});

export const AddPlanEntryInputSchema = z.object({
  date: IsoDate,
  slot: SlugLike,
  recipeId: z.number().int().positive(),
  plannedServings: z.number().int().positive(),
  recipeVersionId: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
});

export const UpdatePlanEntryInputSchema = z.object({
  id: z.number().int().positive(),
  plannedServings: z.number().int().positive().optional(),
  recipeVersionId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const MovePlanEntryInputSchema = z.object({
  id: z.number().int().positive(),
  date: IsoDate,
  slot: SlugLike,
  position: z.number().int().nonnegative().optional(),
});

export const ReorderSlotInputSchema = z.object({
  date: IsoDate,
  slot: SlugLike,
  orderedIds: z.array(z.number().int().positive()).min(1),
});

export const DeletePlanEntryInputSchema = z.object({
  id: z.number().int().positive(),
});

export const ListSlotsInputSchema = z.object({}).optional();

export const AddSlotInputSchema = z.object({
  slug: SlugLike,
  name: z.string().min(1).max(64),
});

export const UpdateSlotInputSchema = z.object({
  slug: SlugLike,
  name: z.string().min(1).max(64).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

export const DeleteSlotInputSchema = z.object({
  slug: SlugLike,
});

export type WeekViewInput = z.infer<typeof WeekViewInputSchema>;
export type AddPlanEntryInput = z.infer<typeof AddPlanEntryInputSchema>;
export type UpdatePlanEntryInput = z.infer<typeof UpdatePlanEntryInputSchema>;
export type MovePlanEntryInput = z.infer<typeof MovePlanEntryInputSchema>;
export type ReorderSlotInput = z.infer<typeof ReorderSlotInputSchema>;
export type DeletePlanEntryInput = z.infer<typeof DeletePlanEntryInputSchema>;
export type AddSlotInput = z.infer<typeof AddSlotInputSchema>;
export type UpdateSlotInput = z.infer<typeof UpdateSlotInputSchema>;
export type DeleteSlotInput = z.infer<typeof DeleteSlotInputSchema>;
