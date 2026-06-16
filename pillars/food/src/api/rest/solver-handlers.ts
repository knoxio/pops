/**
 * Handler for the `solver.*` sub-router. Delegates to the moved
 * `canICook` orchestrator; pure read, no error mapping beyond the shared
 * `runHttp` passthrough (assembly-level failures propagate as 500).
 */
import { canICook } from '../modules/solver/can-i-cook.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodSolverContract } from '../../contract/rest-solver.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodSolverContract>;

export function makeSolverHandlers(db: FoodDb) {
  return {
    canICook: ({ body }: Req['canICook']) =>
      runHttp(() => ({ status: 200 as const, body: canICook(db, body) })),
  };
}
