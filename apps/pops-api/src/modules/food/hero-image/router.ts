import { TRPCError } from '@trpc/server';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { removeHeroImage, uploadHeroImage } from './service.js';
import { RemoveHeroSchema, UploadHeroSchema } from './types.js';

export const heroImageRouter = router({
  /** Upload a hero image for a recipe (base64 wire format). */
  upload: protectedProcedure.input(UploadHeroSchema).mutation(async ({ input }) => {
    try {
      const buffer = Buffer.from(input.contentBase64, 'base64');
      const result = await uploadHeroImage({
        recipeId: input.recipeId,
        mimeType: input.mimeType,
        buffer,
      });
      return { data: result, message: 'Hero image uploaded' };
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

  /** Remove a hero image (clears the column + deletes the files). */
  remove: protectedProcedure.input(RemoveHeroSchema).mutation(({ input }) => {
    try {
      removeHeroImage(input.recipeId);
      return { ok: true as const, message: 'Hero image removed' };
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
});
