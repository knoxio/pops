import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/photos/service.js';
import { toPhoto } from '../modules/photos/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryPhotosContract } from '../../contract/rest-photos.js';

type Req = ServerInferRequest<typeof inventoryPhotosContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** Handlers for the `photos.*` sub-router. `upload` decodes the base64 body to a Buffer for the sharp pipeline. */
export function makePhotosHandlers(db: InventoryDb) {
  return {
    upload: ({ params, body }: Req['upload']) =>
      runHttp(async () => {
        const row = await service.uploadPhoto(db, {
          itemId: params.itemId,
          buffer: Buffer.from(body.fileBase64, 'base64'),
          caption: body.caption,
          sortOrder: body.sortOrder,
        });
        return { status: 201 as const, body: { data: toPhoto(row), message: 'Photo uploaded' } };
      }),

    attach: ({ params, body }: Req['attach']) =>
      runHttp(() => {
        const row = service.attachPhoto(db, {
          itemId: params.itemId,
          filePath: body.filePath,
          caption: body.caption,
          sortOrder: body.sortOrder,
        });
        return { status: 201 as const, body: { data: toPhoto(row), message: 'Photo attached' } };
      }),

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listPhotosForItem(db, params.itemId, limit, offset);
        return {
          status: 200 as const,
          body: { data: rows.map(toPhoto), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    reorder: ({ params, body }: Req['reorder']) =>
      runHttp(() => {
        const rows = service.reorderPhotos(db, params.itemId, body.orderedIds);
        return {
          status: 200 as const,
          body: { data: rows.map(toPhoto), message: 'Photos reordered' },
        };
      }),

    remove: ({ params }: Req['remove']) =>
      runHttp(() => {
        service.removePhoto(db, params.id);
        return { status: 200 as const, body: { message: 'Photo removed' } };
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: toPhoto(service.updatePhoto(db, params.id, body)), message: 'Photo updated' },
      })),
  };
}
