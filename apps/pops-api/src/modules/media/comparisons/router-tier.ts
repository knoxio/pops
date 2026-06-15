import { protectedProcedure } from '../../../trpc.js';
import { rethrowKnownErrors } from './router-helpers.js';
import * as service from './service.js';
import { GetTierListMoviesSchema, SubmitTierListSchema } from './types.js';

export const tierProcedures = {
  /** Get up to 8 movies for a tier list placement round. */
  getTierListMovies: protectedProcedure.input(GetTierListMoviesSchema).query(({ input }) => {
    try {
      const movies = service.getTierListMovies(input.dimensionId);
      return { data: movies };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Submit a tier list: converts placements to pairwise comparisons + tier overrides. */
  submitTierList: protectedProcedure.input(SubmitTierListSchema).mutation(({ input }) => {
    try {
      const result = service.submitTierList(input);
      return { data: result, message: 'Tier list submitted' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),
};
