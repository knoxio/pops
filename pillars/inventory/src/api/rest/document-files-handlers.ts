import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/document-files/service.js';
import { toUploadedFile } from '../modules/document-files/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryDocumentFilesContract } from '../../contract/rest-document-files.js';

type Req = ServerInferRequest<typeof inventoryDocumentFilesContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** Handlers for the `documentFiles.*` sub-router. `upload` decodes the base64 body to a Buffer. */
export function makeDocumentFilesHandlers(db: InventoryDb) {
  return {
    upload: ({ params, body }: Req['upload']) =>
      runHttp(() => {
        const row = service.uploadDocument(db, {
          itemId: params.itemId,
          fileName: body.fileName,
          mimeType: body.mimeType,
          buffer: Buffer.from(body.fileBase64, 'base64'),
        });
        return {
          status: 201 as const,
          body: { data: toUploadedFile(row), message: 'Document uploaded' },
        };
      }),

    removeUpload: ({ params }: Req['removeUpload']) =>
      runHttp(() => {
        service.removeUpload(db, params.id);
        return { status: 200 as const, body: { message: 'Document removed' } };
      }),

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listUploadsForItem(db, params.itemId, limit, offset);
        return {
          status: 200 as const,
          body: {
            data: rows.map(toUploadedFile),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),
  };
}
