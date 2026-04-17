/**
 * Item photos tRPC router — attach/remove/reorder photos per inventory item.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  AttachPhotoSchema,
  PhotoQuerySchema,
  ReorderPhotosSchema,
  toPhoto,
  UpdatePhotoSchema,
  UploadPhotoSchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const photosRouter = router({
  /**
   * Upload a photo for an inventory item.
   * Accepts base64-encoded file bytes, compresses (1920px max, HEIC→JPEG, strip EXIF),
   * writes to `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg`, and creates a DB record.
   */
  upload: protectedProcedure.input(UploadPhotoSchema).mutation(async ({ input }) => {
    try {
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const row = await service.uploadPhoto({
        itemId: input.itemId,
        buffer,
        caption: input.caption,
        sortOrder: input.sortOrder,
      });
      return {
        data: toPhoto(row),
        message: 'Photo uploaded',
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

  /** Attach a photo to an inventory item. */
  attach: protectedProcedure.input(AttachPhotoSchema).mutation(({ input }) => {
    try {
      const row = service.attachPhoto(input);
      return {
        data: toPhoto(row),
        message: 'Photo attached',
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

  /** Remove a photo by ID. */
  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.removePhoto(input.id);
        return { message: 'Photo removed' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Update a photo's caption or sort order. */
  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: UpdatePhotoSchema }))
    .mutation(({ input }) => {
      try {
        const row = service.updatePhoto(input.id, input.data);
        return {
          data: toPhoto(row),
          message: 'Photo updated',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** List photos for an item, ordered by sortOrder. */
  listForItem: protectedProcedure.input(PhotoQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listPhotosForItem(input.itemId, limit, offset);

    return {
      data: rows.map(toPhoto),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Reorder photos for an item. */
  reorder: protectedProcedure.input(ReorderPhotosSchema).mutation(({ input }) => {
    try {
      const rows = service.reorderPhotos(input.itemId, input.orderedIds);
      return {
        data: rows.map(toPhoto),
        message: 'Photos reordered',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
