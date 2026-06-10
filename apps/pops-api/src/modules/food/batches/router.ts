/**
 * `food.batches.*` tRPC router — scaffold for PRD-145 + PRD-146.
 *
 * Every procedure throws `NotImplemented` at runtime. Inputs are the
 * real PRD-spec'd Zod schemas; outputs are typed against the contracts
 * exported from `@pops/app-food-db`. PRDs 145 + 146 swap each
 * implementation in turn without re-shaping the wire surface.
 *
 * `searchForConsume` is owned by PRD-146; the rest by PRD-145.
 */

import { TRPCError } from '@trpc/server';

import { protectedProcedure, router } from '../../../trpc.js';
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

const NOT_IMPLEMENTED_MESSAGE =
  'food.batches.* is a scaffold; PRD-145 + PRD-146 wire real behaviour';

function notImplemented(): never {
  throw new TRPCError({
    code: 'NOT_IMPLEMENTED',
    message: NOT_IMPLEMENTED_MESSAGE,
  });
}

export const batchesRouter = router({
  create: protectedProcedure
    .input(CreateBatchInputSchema)
    .mutation((): { batchId: number } => notImplemented()),

  get: protectedProcedure
    .input(GetBatchInputSchema)
    .query((): BatchDetail | null => notImplemented()),

  relocate: protectedProcedure
    .input(RelocateBatchInputSchema)
    .mutation((): BatchMutationResult => notImplemented()),

  edit: protectedProcedure
    .input(EditBatchInputSchema)
    .mutation((): BatchMutationResult => notImplemented()),

  adjustQty: protectedProcedure
    .input(AdjustBatchQtyInputSchema)
    .mutation((): BatchAdjustResult => notImplemented()),

  delete: protectedProcedure
    .input(DeleteBatchInputSchema)
    .mutation((): BatchMutationResult => notImplemented()),

  searchForConsume: protectedProcedure
    .input(SearchForConsumeInputSchema)
    .query((): { items: readonly BatchForConsumeRow[] } => notImplemented()),
});
