/**
 * Item photos tRPC router — attach/remove/reorder photos per inventory item.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { paginationMeta } from '../../shared/pagination.js';
import { protectedProcedure, router } from '../../trpc.js';
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
  upload: protectedProcedure.input(UploadPhotoSchema).mutation(async ({ input, ctx }) => {
    try {
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const row = await service.uploadPhoto(ctx.inventoryDb, {
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

  attach: protectedProcedure.input(AttachPhotoSchema).mutation(({ input, ctx }) => {
    try {
      const row = service.attachPhoto(ctx.inventoryDb, input);
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

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      try {
        service.removePhoto(ctx.inventoryDb, input.id);
        return { message: 'Photo removed' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: UpdatePhotoSchema }))
    .mutation(({ input, ctx }) => {
      try {
        const row = service.updatePhoto(ctx.inventoryDb, input.id, input.data);
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

  listForItem: protectedProcedure.input(PhotoQuerySchema).query(({ input, ctx }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listPhotosForItem(ctx.inventoryDb, input.itemId, limit, offset);

    return {
      data: rows.map(toPhoto),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  reorder: protectedProcedure.input(ReorderPhotosSchema).mutation(({ input, ctx }) => {
    try {
      const rows = service.reorderPhotos(ctx.inventoryDb, input.itemId, input.orderedIds);
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
