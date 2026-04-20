import { protectedProcedure } from '../../../trpc.js';
import * as debriefService from '../debrief/service.js';
import { rethrowKnownErrors } from './router-helpers.js';
import * as service from './service.js';
import {
  DismissDebriefDimensionSchema,
  GetDebriefOpponentSchema,
  GetDebriefSchema,
  GetTierListMoviesSchema,
  RecordDebriefComparisonSchema,
  SubmitTierListSchema,
} from './types.js';

export const debriefAndTierProcedures = {
  /** Get all movies with pending/active debrief sessions. */
  getPendingDebriefs: protectedProcedure.query(() => {
    const debriefs = service.getPendingDebriefs();
    return { data: debriefs };
  }),

  /** Get a debrief opponent — movie closest to median score, excluding ineligible. */
  getDebriefOpponent: protectedProcedure.input(GetDebriefOpponentSchema).query(({ input }) => {
    try {
      const opponent = service.getDebriefOpponent(
        input.mediaType,
        input.mediaId,
        input.dimensionId
      );
      return { data: opponent };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

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

  /** Record a debrief comparison (or skip) for a session + dimension. */
  recordDebriefComparison: protectedProcedure
    .input(RecordDebriefComparisonSchema)
    .mutation(({ input }) => {
      try {
        const result = service.recordDebriefComparison(input);
        return { data: result, message: 'Debrief comparison recorded' };
      } catch (err) {
        rethrowKnownErrors(err);
      }
    }),

  /** Get a debrief session by media — looks up most recent session (including complete). */
  getDebrief: protectedProcedure.input(GetDebriefSchema).query(({ input }) => {
    try {
      const debrief = debriefService.getDebriefByMedia(input.mediaType, input.mediaId);
      return { data: debrief };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Dismiss a debrief dimension (skip without comparing). */
  dismissDebriefDimension: protectedProcedure
    .input(DismissDebriefDimensionSchema)
    .mutation(({ input }) => {
      try {
        service.dismissDebriefDimension(input.sessionId, input.dimensionId);
        return { message: 'Dimension dismissed' };
      } catch (err) {
        rethrowKnownErrors(err);
      }
    }),
};
