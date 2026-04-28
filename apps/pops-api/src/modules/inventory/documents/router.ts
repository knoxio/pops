/**
 * Item documents tRPC router — link/unlink Paperless-ngx documents to inventory items.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { SETTINGS_KEYS } from '@pops/types';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { resolveNumber } from '../../core/settings/index.js';
import * as service from './service.js';
import { DocumentQuerySchema, LinkDocumentSchema, toItemDocument } from './types.js';

const DEFAULT_OFFSET = 0;

export const documentsRouter = router({
  /** Link a Paperless-ngx document to an inventory item. */
  link: protectedProcedure.input(LinkDocumentSchema).mutation(({ input }) => {
    try {
      const row = service.linkDocument(
        input.itemId,
        input.paperlessDocumentId,
        input.documentType,
        input.title
      );
      return {
        data: toItemDocument(row),
        message: 'Document linked',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: 'CONFLICT', message: err.message });
      }
      throw err;
    }
  }),

  /** Unlink a document from an item by link ID. */
  unlink: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.unlinkDocument(input.id);
        return { message: 'Document unlinked' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** List all documents linked to an item. */
  listForItem: protectedProcedure.input(DocumentQuerySchema).query(({ input }) => {
    const limit =
      input.limit ?? resolveNumber(SETTINGS_KEYS.INVENTORY_DOCUMENTS_DEFAULT_LIMIT, 50);
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listDocumentsForItem(input.itemId, limit, offset);

    return {
      data: rows.map(toItemDocument),
      pagination: paginationMeta(total, limit, offset),
    };
  }),
});
