/**
 * `food.plan.*` tRPC router — PRD-143.
 *
 * 10 procedures wrap PRD-111's plan service + a denormalised
 * `weekView` read projection. Mutations map service errors and
 * router-side validation (recipe archived / no current version) onto
 * the result discriminated unions so the UI gets structured failure
 * reasons instead of opaque tRPC errors.
 */

import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import {
  planEntries,
  planService,
  PlanEntryHasCookEvent,
  PlanEntryNotFound,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import {
  AddPlanEntryInputSchema,
  DeletePlanEntryInputSchema,
  MovePlanEntryInputSchema,
  ReorderSlotInputSchema,
  UpdatePlanEntryInputSchema,
  WeekViewInputSchema,
} from './inputs.js';
import { BadIsoDateError, isValidIsoDate } from './iso-week.js';
import {
  nextPositionForSlot,
  planEntryById,
  planEntryFail,
  recipeGuard,
  slotExists,
} from './router-helpers.js';
import {
  addSlotProcedure,
  deleteSlotProcedure,
  listSlotsProcedure,
  updateSlotProcedure,
} from './slot-procedures.js';
import { buildWeekView } from './week-view.js';

import type {
  PlanEntryError,
  PlanEntryMutationResult,
  ReorderSlotResult,
  WeekView,
} from '@pops/app-food-db';

type AddEntryOk = { ok: true; id: number; position: number };
type AddEntryFail = { ok: false; reason: PlanEntryError };
type AddEntryResult = AddEntryOk | AddEntryFail;

function applyEntryPatch(
  id: number,
  patch: { plannedServings?: number; recipeVersionId?: number | null; notes?: string | null }
): void {
  const updates: Record<string, unknown> = {};
  if (patch.plannedServings !== undefined) updates.plannedServings = patch.plannedServings;
  if (patch.recipeVersionId !== undefined) updates.recipeVersionId = patch.recipeVersionId;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (Object.keys(updates).length === 0) return;
  getDrizzle().update(planEntries).set(updates).where(eq(planEntries.id, id)).run();
}

export const planRouter = router({
  weekView: protectedProcedure.input(WeekViewInputSchema).query(({ input }): WeekView => {
    try {
      return buildWeekView(getDrizzle(), input.weekStart);
    } catch (err) {
      if (err instanceof BadIsoDateError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }
  }),

  addEntry: protectedProcedure
    .input(AddPlanEntryInputSchema)
    .mutation(({ input }): AddEntryResult => {
      const db = getDrizzle();
      if (!isValidIsoDate(input.date)) return planEntryFail('BadDate');
      if (!slotExists(db, input.slot)) return planEntryFail('BadSlot');
      const guard = recipeGuard(db, input.recipeId, input.recipeVersionId ?? null);
      if (guard !== null) return guard;
      const row = db.transaction(() =>
        planService.addPlanEntry(db, {
          date: input.date,
          slot: input.slot,
          recipeId: input.recipeId,
          recipeVersionId: input.recipeVersionId ?? null,
          plannedServings: input.plannedServings,
          notes: input.notes ?? null,
        })
      );
      return { ok: true, id: row.id, position: row.position };
    }),

  updateEntry: protectedProcedure
    .input(UpdatePlanEntryInputSchema)
    .mutation(({ input }): PlanEntryMutationResult => {
      const db = getDrizzle();
      return db.transaction(() => {
        const existing = planEntryById(db, input.id);
        if (existing === null) return planEntryFail('NotFound');
        if (existing.recipeRunId !== null) return planEntryFail('AlreadyCooked');
        if (input.recipeVersionId !== undefined) {
          const guard = recipeGuard(db, existing.recipeId, input.recipeVersionId);
          if (guard !== null) return guard;
        }
        applyEntryPatch(input.id, input);
        return { ok: true };
      });
    }),

  moveEntry: protectedProcedure
    .input(MovePlanEntryInputSchema)
    .mutation(({ input }): PlanEntryMutationResult => {
      const db = getDrizzle();
      if (!isValidIsoDate(input.date)) return planEntryFail('BadDate');
      return db.transaction(() => {
        const existing = planEntryById(db, input.id);
        if (existing === null) return planEntryFail('NotFound');
        if (existing.recipeRunId !== null) return planEntryFail('AlreadyCooked');
        if (!slotExists(db, input.slot)) return planEntryFail('BadSlot');
        const position = input.position ?? nextPositionForSlot(db, input.date, input.slot);
        db.update(planEntries)
          .set({ date: input.date, slot: input.slot, position })
          .where(eq(planEntries.id, input.id))
          .run();
        return { ok: true };
      });
    }),

  reorderSlot: protectedProcedure
    .input(ReorderSlotInputSchema)
    .mutation(({ input }): ReorderSlotResult => {
      const db = getDrizzle();
      if (input.orderedIds.length === 0) return { ok: false, reason: 'EmptySlot' };
      return db.transaction(() => {
        const cellRows = db
          .select({ id: planEntries.id })
          .from(planEntries)
          .where(and(eq(planEntries.date, input.date), eq(planEntries.slot, input.slot)))
          .all();
        const cellIds = new Set(cellRows.map((r) => r.id));
        const allBelong = input.orderedIds.every((id) => cellIds.has(id));
        const inputIds = new Set(input.orderedIds);
        if (!allBelong || inputIds.size !== input.orderedIds.length) {
          return { ok: false, reason: 'BadIds' };
        }
        planService.reorderSlot(db, input.orderedIds);
        return { ok: true };
      });
    }),

  deleteEntry: protectedProcedure
    .input(DeletePlanEntryInputSchema)
    .mutation(({ input }): PlanEntryMutationResult => {
      try {
        planService.removePlanEntry(getDrizzle(), input.id);
        return { ok: true };
      } catch (err) {
        if (err instanceof PlanEntryNotFound) return planEntryFail('NotFound');
        if (err instanceof PlanEntryHasCookEvent) return planEntryFail('AlreadyCooked');
        throw err;
      }
    }),

  listSlots: listSlotsProcedure,
  addSlot: addSlotProcedure,
  updateSlot: updateSlotProcedure,
  deleteSlot: deleteSlotProcedure,
});
