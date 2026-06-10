/**
 * `food.batches.*` tRPC router — PRD-145 lifecycle + PRD-146 picker.
 *
 * Six lifecycle procedures wired to `batchesLifecycleService` from
 * `@pops/app-food-db`. `searchForConsume` powers PRD-146's
 * `BatchOverridePicker` widget.
 */

import { TRPCError } from '@trpc/server';

import { batchesLifecycleService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getBatchDetail } from './get.js';
import {
  AdjustBatchQtyInputSchema,
  CreateBatchInputSchema,
  DeleteBatchInputSchema,
  EditBatchInputSchema,
  GetBatchInputSchema,
  RelocateBatchInputSchema,
  SearchForConsumeInputSchema,
} from './inputs.js';
import { searchForConsume } from './search-for-consume.js';

import type {
  BatchAdjustResult,
  BatchDetail,
  BatchForConsumeRow,
  BatchMutationResult,
} from '@pops/app-food-db';

export const batchesRouter = router({
  create: protectedProcedure
    .input(CreateBatchInputSchema)
    .mutation(({ input }): { batchId: number } => {
      const result = batchesLifecycleService.createBatchManual(getDrizzle(), {
        variantId: input.variantId,
        prepStateId: input.prepStateId,
        qty: input.qty,
        unit: input.unit,
        location: input.location,
        sourceType: input.sourceType,
        producedAt: input.producedAt,
        expiresAt: input.expiresAt,
        notes: input.notes,
      });
      if (result.ok === false) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `createBatchManual rejected: ${result.reason}`,
        });
      }
      return { batchId: result.batchId };
    }),

  get: protectedProcedure.input(GetBatchInputSchema).query(({ input }): BatchDetail | null => {
    return getBatchDetail(getDrizzle(), input.id);
  }),

  relocate: protectedProcedure
    .input(RelocateBatchInputSchema)
    .mutation(({ input }): BatchMutationResult => {
      return batchesLifecycleService.relocateBatch(getDrizzle(), input.id, input.location);
    }),

  edit: protectedProcedure
    .input(EditBatchInputSchema)
    .mutation(({ input }): BatchMutationResult => {
      return batchesLifecycleService.editBatch(getDrizzle(), input.id, {
        expiresAt: input.expiresAt,
        notes: input.notes,
        prepStateId: input.prepStateId,
      });
    }),

  adjustQty: protectedProcedure
    .input(AdjustBatchQtyInputSchema)
    .mutation(({ input }): BatchAdjustResult => {
      return batchesLifecycleService.adjustBatchQty(
        getDrizzle(),
        input.id,
        input.delta,
        input.reason
      );
    }),

  delete: protectedProcedure
    .input(DeleteBatchInputSchema)
    .mutation(({ input }): BatchMutationResult => {
      return batchesLifecycleService.deleteBatch(getDrizzle(), input.id);
    }),

  searchForConsume: protectedProcedure
    .input(SearchForConsumeInputSchema)
    .query(({ input }): { items: readonly BatchForConsumeRow[] } => {
      return searchForConsume(getDrizzle(), input);
    }),
});
