import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure } from '../../../trpc.js';
import { rethrowKnownErrors } from './router-helpers.js';
import * as service from './service.js';
import * as stalenessService from './staleness.js';
import {
  DimensionExclusionSchema,
  RankingsQuerySchema,
  ScoreQuerySchema,
  SmartPairQuerySchema,
  StalenessSchema,
  toMediaScore,
} from './types.js';

const DEFAULT_LIMIT = 50;

export const pairsAndScoresProcedures = {
  /** Get a smart pair using weighted probabilistic selection, with random fallback. */
  getSmartPair: protectedProcedure.input(SmartPairQuerySchema).query(({ input }) => {
    try {
      const pair = service.getSmartPair(input.dimensionId);
      if (pair) return { data: pair, reason: null };
      if (input.dimensionId) {
        const randomPair = service.getRandomPair(input.dimensionId);
        if (randomPair) {
          return { data: { ...randomPair, dimensionId: input.dimensionId }, reason: null };
        }
      }
      return { data: null, reason: 'insufficient_watched_movies' as const };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Get scores for a media item (optionally filtered by dimension). */
  scores: protectedProcedure.input(ScoreQuerySchema).query(({ input }) => {
    const rows = service.getScoresForMedia(input.mediaType, input.mediaId, input.dimensionId);
    return { data: rows.map(toMediaScore) };
  }),

  /** Get ranked list of media items by Elo score (per-dimension or Overall). */
  rankings: protectedProcedure.input(RankingsQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const { rows, total } = service.getRankings(input.dimensionId, input.mediaType, limit, offset);
    return {
      data: rows,
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Exclude a media item from a dimension (removes comparisons, recalculates Elo). */
  excludeFromDimension: protectedProcedure.input(DimensionExclusionSchema).mutation(({ input }) => {
    try {
      const { comparisonsDeleted } = service.excludeFromDimension(
        input.mediaType,
        input.mediaId,
        input.dimensionId
      );
      return { comparisonsDeleted };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Re-include a media item in a dimension. */
  includeInDimension: protectedProcedure.input(DimensionExclusionSchema).mutation(({ input }) => {
    try {
      service.includeInDimension(input.mediaType, input.mediaId, input.dimensionId);
      return { message: 'Media included in dimension' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Mark a media item as stale (compounds ×0.5 each call, floor 0.01). */
  markStale: protectedProcedure.input(StalenessSchema).mutation(({ input }) => {
    const staleness = stalenessService.markStale(input.mediaType, input.mediaId);
    return { data: { staleness } };
  }),

  /** Get the staleness value for a media item (default 1.0 = fresh). */
  getStaleness: protectedProcedure.input(StalenessSchema).query(({ input }) => {
    const staleness = stalenessService.getStaleness(input.mediaType, input.mediaId);
    return { data: { staleness } };
  }),

  /** Recalculate ELO scores for all dimensions (replays all comparisons). */
  recalcAll: protectedProcedure.mutation(() => {
    const count = service.recalcAllDimensions();
    return { data: { dimensionsRecalculated: count }, message: `Recalculated ${count} dimensions` };
  }),
};
