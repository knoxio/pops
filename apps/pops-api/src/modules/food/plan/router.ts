/**
 * `food.plan.*` tRPC router — scaffold for PRD-143.
 *
 * 10 procedures matching the planning-page spec. Every procedure
 * throws `NotImplemented` here; PRD-143 swaps real bodies in without
 * re-shaping the wire surface.
 *
 * Slot management procedures (`addSlot`/`updateSlot`/`deleteSlot`)
 * delegate to PRD-111's existing `planService` once wired — the
 * underlying service amendments already shipped.
 */

import { TRPCError } from '@trpc/server';

import { protectedProcedure, router } from '../../../trpc.js';
import {
  AddPlanEntryInputSchema,
  AddSlotInputSchema,
  DeletePlanEntryInputSchema,
  DeleteSlotInputSchema,
  MovePlanEntryInputSchema,
  ReorderSlotInputSchema,
  UpdatePlanEntryInputSchema,
  UpdateSlotInputSchema,
  WeekViewInputSchema,
} from './inputs.js';

import type {
  PlanEntryMutationResult,
  PlanSlotDeleteResult,
  PlanSlotMutationResult,
  PlanSlotRow,
  PlanSlotUpdateResult,
  ReorderSlotResult,
  WeekView,
} from '@pops/app-food-db';

const NOT_IMPLEMENTED_MESSAGE = 'food.plan.* is a scaffold; PRD-143 wires real behaviour';

function notImplemented(): never {
  throw new TRPCError({
    code: 'NOT_IMPLEMENTED',
    message: NOT_IMPLEMENTED_MESSAGE,
  });
}

export const planRouter = router({
  weekView: protectedProcedure.input(WeekViewInputSchema).query((): WeekView => notImplemented()),

  addEntry: protectedProcedure
    .input(AddPlanEntryInputSchema)
    .mutation((): { id: number; position: number } => notImplemented()),

  updateEntry: protectedProcedure
    .input(UpdatePlanEntryInputSchema)
    .mutation((): PlanEntryMutationResult => notImplemented()),

  moveEntry: protectedProcedure
    .input(MovePlanEntryInputSchema)
    .mutation((): PlanEntryMutationResult => notImplemented()),

  reorderSlot: protectedProcedure
    .input(ReorderSlotInputSchema)
    .mutation((): ReorderSlotResult => notImplemented()),

  deleteEntry: protectedProcedure
    .input(DeletePlanEntryInputSchema)
    .mutation((): PlanEntryMutationResult => notImplemented()),

  listSlots: protectedProcedure.query((): { slots: readonly PlanSlotRow[] } => notImplemented()),

  addSlot: protectedProcedure
    .input(AddSlotInputSchema)
    .mutation((): PlanSlotMutationResult => notImplemented()),

  updateSlot: protectedProcedure
    .input(UpdateSlotInputSchema)
    .mutation((): PlanSlotUpdateResult => notImplemented()),

  deleteSlot: protectedProcedure
    .input(DeleteSlotInputSchema)
    .mutation((): PlanSlotDeleteResult => notImplemented()),
});
