/**
 * Handlers for the `shopping.*` sub-router. `preview` maps a bad date range
 * to 400; `generate` returns the discriminated result on 200 and writes to
 * the lists pillar via the lazily-resolved ListsClient.
 */
import { type ListsClient } from '../modules/recipes/send-to-list/lists-client.js';
import { generateFromPlan } from '../modules/shopping/generate.js';
import { previewFromPlan } from '../modules/shopping/preview.js';
import { HttpError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodShoppingContract } from '../../contract/rest-shopping.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodShoppingContract>;

export function makeShoppingHandlers(db: FoodDb, resolveClient: () => ListsClient) {
  return {
    preview: ({ body }: Req['preview']) =>
      runHttp(() => {
        const result = previewFromPlan(db, { startDate: body.startDate, endDate: body.endDate });
        if (!result.ok) {
          throw new HttpError(
            400,
            `Invalid date range: ${result.reason}`,
            undefined,
            'common.validationFailed'
          );
        }
        return { status: 200 as const, body: result.preview };
      }),

    generate: ({ body }: Req['generate']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await generateFromPlan(db, resolveClient(), {
          startDate: body.startDate,
          endDate: body.endDate,
          listName: body.listName,
        }),
      })),
  };
}
