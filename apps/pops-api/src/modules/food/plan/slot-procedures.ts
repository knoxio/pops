/**
 * Slot-CRUD procedures for `food.plan.*` — separated from the main
 * router so `router.ts` stays under the per-file line cap.
 */
import {
  InvalidSlugError,
  planService,
  PlanSlotInUse,
  PlanSlotIsDefault,
  PlanSlotNotFound,
  PlanSlotSlugAlreadyExists,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { AddSlotInputSchema, DeleteSlotInputSchema, UpdateSlotInputSchema } from './inputs.js';
import { listWireSlots } from './week-view.js';

import type {
  PlanSlotDeleteResult,
  PlanSlotMutationResult,
  PlanSlotUpdateResult,
  WirePlanSlotRow,
} from '@pops/app-food-db';

export const listSlotsProcedure = protectedProcedure.query(
  (): { slots: readonly WirePlanSlotRow[] } => ({
    slots: listWireSlots(getDrizzle()),
  })
);

export const addSlotProcedure = protectedProcedure
  .input(AddSlotInputSchema)
  .mutation(({ input }): PlanSlotMutationResult => {
    try {
      planService.addSlot(getDrizzle(), { slug: input.slug, name: input.name });
      return { ok: true };
    } catch (err) {
      if (err instanceof PlanSlotSlugAlreadyExists) return { ok: false, reason: 'SlugTaken' };
      if (err instanceof InvalidSlugError) return { ok: false, reason: 'SlugInvalid' };
      throw err;
    }
  });

export const updateSlotProcedure = protectedProcedure
  .input(UpdateSlotInputSchema)
  .mutation(({ input }): PlanSlotUpdateResult => {
    const db = getDrizzle();
    const slot = listWireSlots(db).find((s) => s.slug === input.slug);
    if (slot === undefined) return { ok: false, reason: 'SlotNotFound' };
    if (slot.isDefault && input.name !== undefined) {
      return { ok: false, reason: 'CannotEditDefault' };
    }
    try {
      planService.updateSlot(db, input.slug, {
        name: input.name,
        displayOrder: input.displayOrder,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof PlanSlotNotFound) return { ok: false, reason: 'SlotNotFound' };
      throw err;
    }
  });

export const deleteSlotProcedure = protectedProcedure
  .input(DeleteSlotInputSchema)
  .mutation(({ input }): PlanSlotDeleteResult => {
    try {
      planService.deleteSlot(getDrizzle(), input.slug);
      return { ok: true };
    } catch (err) {
      if (err instanceof PlanSlotNotFound) return { ok: false, reason: 'SlotNotFound' };
      if (err instanceof PlanSlotIsDefault) return { ok: false, reason: 'CannotDeleteDefault' };
      if (err instanceof PlanSlotInUse) return { ok: false, reason: 'SlotInUse' };
      throw err;
    }
  });
