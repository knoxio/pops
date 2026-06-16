/**
 * Handlers for the `batches.*` sub-router. Lifecycle mutations return the
 * service's discriminated result verbatim (200); `create` maps a failed
 * result to 400 and a missing batch on `get` to 404.
 */
import { batchesLifecycleService } from '../../db/index.js';
import { getBatchDetail } from '../modules/batches/get.js';
import { searchForConsume } from '../modules/batches/search-for-consume.js';
import { HttpError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodBatchesContract } from '../../contract/rest-batches.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodBatchesContract>;

export function makeBatchesHandlers(db: FoodDb) {
  return {
    create: ({ body }: Req['create']) =>
      runHttp(() => {
        const result = batchesLifecycleService.createBatchManual(db, {
          variantId: body.variantId,
          prepStateId: body.prepStateId,
          qty: body.qty,
          unit: body.unit,
          location: body.location,
          sourceType: body.sourceType,
          producedAt: body.producedAt,
          expiresAt: body.expiresAt,
          notes: body.notes,
        });
        if (result.ok === false) {
          throw new HttpError(
            400,
            `createBatchManual rejected: ${result.reason}`,
            undefined,
            'common.validationFailed'
          );
        }
        return { status: 201 as const, body: { batchId: result.batchId } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        const detail = getBatchDetail(db, params.id);
        if (detail === null) throw new NotFoundError('Batch', String(params.id));
        return { status: 200 as const, body: { data: detail } };
      }),

    relocate: ({ params, body }: Req['relocate']) =>
      runHttp(() => ({
        status: 200 as const,
        body: batchesLifecycleService.relocateBatch(db, params.id, body.location),
      })),

    edit: ({ params, body }: Req['edit']) =>
      runHttp(() => ({
        status: 200 as const,
        body: batchesLifecycleService.editBatch(db, params.id, {
          expiresAt: body.expiresAt,
          notes: body.notes,
          prepStateId: body.prepStateId,
        }),
      })),

    adjustQty: ({ params, body }: Req['adjustQty']) =>
      runHttp(() => ({
        status: 200 as const,
        body: batchesLifecycleService.adjustBatchQty(db, params.id, body.delta, body.reason),
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => ({
        status: 200 as const,
        body: batchesLifecycleService.deleteBatch(db, params.id),
      })),

    searchForConsume: ({ body }: Req['searchForConsume']) =>
      runHttp(() => ({
        status: 200 as const,
        body: searchForConsume(db, {
          ingredientId: body.ingredientId,
          variantId: body.variantId,
          location: body.location,
          qtyGreaterThan: body.qtyGreaterThan,
          limit: body.limit,
        }),
      })),
  };
}
