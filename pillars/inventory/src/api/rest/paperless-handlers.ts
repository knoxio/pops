import { getPaperlessClient } from '../modules/paperless/index.js';
import { PaperlessApiError } from '../modules/paperless/types.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryPaperlessContract } from '../../contract/rest-paperless.js';

type Req = ServerInferRequest<typeof inventoryPaperlessContract>;

/** Handlers for the `paperless.*` sub-router. No db; `search` returns 412 when Paperless is unconfigured. */
export function makePaperlessHandlers() {
  return {
    status: async () => {
      const client = getPaperlessClient();
      if (!client) {
        return {
          status: 200 as const,
          body: { data: { configured: false, available: false, baseUrl: null } },
        };
      }
      try {
        await client.getDocumentTypes();
        return {
          status: 200 as const,
          body: { data: { configured: true, available: true, baseUrl: client.getBaseUrl() } },
        };
      } catch {
        return {
          status: 200 as const,
          body: { data: { configured: true, available: false, baseUrl: client.getBaseUrl() } },
        };
      }
    },

    search: async ({ query }: Req['search']) => {
      const client = getPaperlessClient();
      if (!client) {
        return {
          status: 412 as const,
          body: {
            message: 'Paperless-ngx is not configured',
            messageKey: 'inventory.paperless.notConfigured',
          },
        };
      }
      try {
        const result = await client.searchDocuments(query.query);
        return {
          status: 200 as const,
          body: {
            data: result.documents.map((doc) => ({
              id: doc.id,
              title: doc.title,
              created: doc.created,
              originalFileName: doc.originalFileName,
              thumbnailUrl: client.getDocumentThumbnailUrl(doc.id),
            })),
          },
        };
      } catch (err) {
        if (err instanceof PaperlessApiError) {
          throw new Error(`Paperless error: ${err.message}`, { cause: err });
        }
        throw err;
      }
    },
  };
}
