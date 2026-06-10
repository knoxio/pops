/**
 * `food.solver.*` tRPC router — PRD-150.
 *
 * One query — `canICook` — that ranks every cookable recipe given the
 * current pantry + substitution graph. Pure read; no caching.
 */

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { canICook } from './can-i-cook.js';
import { CanICookInputSchema } from './inputs.js';

import type { SolveResult } from './types.js';

export const solverRouter = router({
  canICook: protectedProcedure.input(CanICookInputSchema).query(({ input }): SolveResult => {
    return canICook(getDrizzle(), input);
  }),
});
