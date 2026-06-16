/**
 * Paperless-ngx tRPC router — connection status, health check, and document search.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError } from '../../shared/errors.js';
import { protectedProcedure, router } from '../../trpc.js';
import { getPaperlessClient } from './index.js';
import { PaperlessApiError } from './types.js';

function withMessageKey(
  code: ConstructorParameters<typeof TRPCError>[0]['code'],
  message: string,
  messageKey: string,
  originalCause?: unknown
): TRPCError {
  const carrier = new HttpError(500, message, undefined, messageKey);
  if (originalCause !== undefined) carrier.cause = originalCause;
  return new TRPCError({ code, message, cause: carrier });
}

export const paperlessRouter = router({
  /** Check if Paperless-ngx is configured and reachable. */
  status: protectedProcedure.query(async () => {
    const client = getPaperlessClient();

    if (!client) {
      return { data: { configured: false, available: false, baseUrl: null } };
    }

    try {
      await client.getDocumentTypes();
      return { data: { configured: true, available: true, baseUrl: client.getBaseUrl() } };
    } catch {
      return { data: { configured: true, available: false, baseUrl: client.getBaseUrl() } };
    }
  }),

  /** Search Paperless-ngx documents by query string. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(200) }))
    .query(async ({ input }) => {
      const client = getPaperlessClient();
      if (!client) {
        throw withMessageKey(
          'PRECONDITION_FAILED',
          'Paperless-ngx is not configured',
          'inventory.paperless.notConfigured'
        );
      }

      try {
        const result = await client.searchDocuments(input.query);
        return {
          data: result.documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            created: doc.created,
            originalFileName: doc.originalFileName,
            thumbnailUrl: client.getDocumentThumbnailUrl(doc.id),
          })),
        };
      } catch (err) {
        if (err instanceof PaperlessApiError) {
          throw withMessageKey(
            'INTERNAL_SERVER_ERROR',
            `Paperless error: ${err.message}`,
            'inventory.paperless.apiError',
            err
          );
        }
        throw err;
      }
    }),
});
