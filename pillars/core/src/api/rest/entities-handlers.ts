/**
 * Handlers for the `entities.*` sub-router.
 *
 * The entities service throws the shared `NotFoundError` / `ConflictError`
 * directly (each carries the right `statusCode`), so `runHttp` maps them to
 * 404 / 409 envelopes without a per-domain translation layer. The wire
 * shapes (`toEntity`, `{ data, pagination }` for `list`) mirror the legacy
 * `core.entities.*` tRPC router exactly.
 */
import { type CoreDb } from '../../db/index.js';
import * as service from '../modules/entities/service.js';
import { toEntity } from '../modules/entities/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreEntitiesContract } from '../../contract/rest-entities.js';

type Req = ServerInferRequest<typeof coreEntitiesContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export function makeEntitiesHandlers(db: CoreDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        const { rows, total } = service.listEntities(db, {
          search: query.search,
          type: query.type,
          limit,
          offset,
        });

        return {
          status: 200 as const,
          body: { data: rows.map(toEntity), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        const row = service.getEntity(db, params.id);
        return { status: 200 as const, body: { data: toEntity(row) } };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        const row = service.createEntity(db, body);
        return {
          status: 201 as const,
          body: { data: toEntity(row), message: 'Entity created' },
        };
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        const row = service.updateEntity(db, params.id, body);
        return {
          status: 200 as const,
          body: { data: toEntity(row), message: 'Entity updated' },
        };
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        service.deleteEntity(db, params.id);
        return { status: 200 as const, body: { message: 'Entity deleted' } };
      }),
  };
}
