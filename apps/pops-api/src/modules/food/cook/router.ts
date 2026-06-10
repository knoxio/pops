/**
 * `food.cook.*` tRPC router — scaffold for PRD-144.
 *
 * Two procedures. `prepareCook` is the modal-open query; `markCooked`
 * is the transactional mutation that wraps PRD-108's `consumeForRun`
 * + PRD-145's `createBatchFromRun`. Both throw `NotImplemented` here;
 * PRD-144 swaps real bodies in without re-shaping the wire surface.
 */

import { TRPCError } from '@trpc/server';

import { protectedProcedure, router } from '../../../trpc.js';
import { MarkCookedInputSchema, PrepareCookInputSchema } from './inputs.js';

import type { CookPreparation, MarkCookedResult } from '@pops/app-food-db';

const NOT_IMPLEMENTED_MESSAGE = 'food.cook.* is a scaffold; PRD-144 wires real behaviour';

function notImplemented(): never {
  throw new TRPCError({
    code: 'NOT_IMPLEMENTED',
    message: NOT_IMPLEMENTED_MESSAGE,
  });
}

export const cookRouter = router({
  prepareCook: protectedProcedure
    .input(PrepareCookInputSchema)
    .query((): CookPreparation => notImplemented()),

  markCooked: protectedProcedure
    .input(MarkCookedInputSchema)
    .mutation((): MarkCookedResult => notImplemented()),
});
