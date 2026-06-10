/**
 * `food.batches.*` tRPC router — PRD-145 behaviour + PRD-146 scaffold.
 *
 * Six lifecycle procedures wired to `batchesLifecycleService` from
 * `@pops/app-food-db`. `searchForConsume` remains a PRD-146 stub.
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

import type {
  BatchAdjustResult,
  BatchDetail,
  BatchForConsumeRow,
  BatchMutationResult,
} from '@pops/app-food-db';

const NOT_IMPLEMENTED_MESSAGE = 'food.batches.searchForConsume is a scaffold; PRD-146 wires it';

function notImplemented(): never {
  throw new TRPCError({
    code: 'NOT_IMPLEMENTED',
    message: NOT_IMPLEMENTED_MESSAGE,
  });
}

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
    .query((): { items: readonly BatchForConsumeRow[] } => notImplemented()),
});
