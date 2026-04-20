import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure } from '../../../trpc.js';
import { rethrowKnownErrors } from './router-helpers.js';
import * as service from './service.js';
import {
  BatchRecordComparisonsSchema,
  BlacklistMovieSchema,
  ComparisonHistoryQuerySchema,
  ComparisonQuerySchema,
  DeleteComparisonSchema,
  RecordComparisonSchema,
  RecordSkipSchema,
  toComparison,
} from './types.js';

const DEFAULT_LIMIT = 50;

export const comparisonProcedures = {
  /** Record a 1v1 comparison (updates Elo scores). */
  record: protectedProcedure.input(RecordComparisonSchema).mutation(({ input }) => {
    try {
      const row = service.recordComparison(input);
      return { data: toComparison(row), message: 'Comparison recorded' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** List comparisons for a media item. */
  listForMedia: protectedProcedure.input(ComparisonQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const { rows, total } = service.listComparisonsForMedia({
      mediaType: input.mediaType,
      mediaId: input.mediaId,
      dimensionId: input.dimensionId,
      limit,
      offset,
    });
    return {
      data: rows.map(toComparison),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** List all comparisons (paginated, optional dimension filter). */
  listAll: protectedProcedure.input(ComparisonHistoryQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const { rows, total } = service.listAllComparisons(
      input.dimensionId,
      input.search,
      limit,
      offset
    );
    return {
      data: rows.map(toComparison),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Delete a comparison and recalculate Elo scores. */
  delete: protectedProcedure.input(DeleteComparisonSchema).mutation(({ input }) => {
    try {
      service.deleteComparison(input.id);
      return { message: 'Comparison deleted and scores recalculated' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),

  /** Blacklist a movie: mark watch events + purge comparisons + recalculate Elo. */
  blacklistMovie: protectedProcedure.input(BlacklistMovieSchema).mutation(({ input }) => {
    const result = service.blacklistMovie(input.mediaType, input.mediaId);
    return { data: result, message: 'Movie blacklisted and comparisons purged' };
  }),

  /** Batch record comparisons in a single transaction with ELO updates. */
  batchRecordComparisons: protectedProcedure
    .input(BatchRecordComparisonsSchema)
    .mutation(({ input }) => {
      try {
        const result = service.batchRecordComparisons(input.dimensionId, input.comparisons);
        return { data: result, message: `${result.count} comparisons recorded` };
      } catch (err) {
        rethrowKnownErrors(err);
      }
    }),

  /** Record a skip (puts pair on cooloff for 10 global comparisons). */
  recordSkip: protectedProcedure.input(RecordSkipSchema).mutation(({ input }) => {
    try {
      const skipUntil = service.recordSkip({
        dimensionId: input.dimensionId,
        mediaAType: input.mediaAType,
        mediaAId: input.mediaAId,
        mediaBType: input.mediaBType,
        mediaBId: input.mediaBId,
      });
      return { data: { skipUntil }, message: 'Skip recorded' };
    } catch (err) {
      rethrowKnownErrors(err);
    }
  }),
};
