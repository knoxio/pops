import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { rethrowKnownErrors } from './router-helpers.js';
import * as service from './service.js';
import { CreateDimensionSchema, toDimension, UpdateDimensionSchema } from './types.js';

export const dimensionProcedures = {
  /** List all dimensions ordered by sort_order. */
  listDimensions: protectedProcedure.query(() => {
    const rows = service.listDimensions();
    return { data: rows.map(toDimension) };
  }),

  /** Create a new dimension. */
  createDimension: protectedProcedure.input(CreateDimensionSchema).mutation(({ input }) => {
    try {
      const row = service.createDimension(input);
      return { data: toDimension(row), message: 'Dimension created' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Update a dimension. */
  updateDimension: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: UpdateDimensionSchema }))
    .mutation(({ input }) => {
      try {
        const row = service.updateDimension(input.id, input.data);
        return { data: toDimension(row), message: 'Dimension updated' };
      } catch (err) {
        rethrowKnownErrors(err);
      }
    }),
};
