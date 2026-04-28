/**
 * Item uploaded files tRPC router — direct (non-Paperless) document uploads
 * attached to an inventory item. Mirrors `inventory.photos.*` but for
 * arbitrary file types (PDF, images, text).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { SETTINGS_KEYS } from '@pops/types';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { resolveNumber } from '../../core/settings/index.js';
import * as service from './service.js';
import { DocumentFileQuerySchema, toUploadedFile, UploadDocumentSchema } from './types.js';

const DEFAULT_OFFSET = 0;

export const documentFilesRouter = router({
  /**
   * Upload a document for an inventory item. Accepts base64-encoded file bytes,
   * writes to `{INVENTORY_DOCUMENTS_DIR}/items/{itemId}/file_NNN.{ext}`, and
   * creates a DB record with file metadata.
   */
  upload: protectedProcedure.input(UploadDocumentSchema).mutation(({ input }) => {
    try {
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const row = service.uploadDocument({
        itemId: input.itemId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        buffer,
      });
      return {
        data: toUploadedFile(row),
        message: 'Document uploaded',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      if (err instanceof ValidationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }
  }),

  /** Remove an uploaded document by ID. */
  removeUpload: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.removeUpload(input.id);
        return { message: 'Document removed' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** List uploaded documents for an item, newest first. */
  listForItem: protectedProcedure.input(DocumentFileQuerySchema).query(({ input }) => {
    const limit =
      input.limit ?? resolveNumber(SETTINGS_KEYS.INVENTORY_DOCUMENT_FILES_DEFAULT_LIMIT, 50);
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listUploadsForItem(input.itemId, limit, offset);

    return {
      data: rows.map(toUploadedFile),
      pagination: paginationMeta(total, limit, offset),
    };
  }),
});
