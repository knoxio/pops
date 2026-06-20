/**
 * Handlers for the `prepStates.*` sub-router.
 *
 * Slug validation lives in the db service: `InvalidSlugError` → 400,
 * `SlugAlreadyRegisteredError` → 409 (slug taken under any kind).
 */
import { InvalidSlugError, prepStatesService, SlugAlreadyRegisteredError } from '../../db/index.js';
import { ConflictError, HttpError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodPrepStatesContract } from '../../contract/rest-prep-states.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodPrepStatesContract>;

function translateSlugError(err: unknown): never {
  if (err instanceof InvalidSlugError) {
    throw new HttpError(400, err.message, undefined, 'common.validationFailed');
  }
  if (err instanceof SlugAlreadyRegisteredError) throw new ConflictError(err.message);
  throw err;
}

export function makePrepStatesHandlers(db: FoodDb) {
  return {
    list: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: prepStatesService.listPrepStates(db) },
      })),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          return {
            status: 201 as const,
            body: { data: prepStatesService.createPrepState(db, body) },
          };
        } catch (err) {
          translateSlugError(err);
        }
      }),
  };
}
