/**
 * Comparisons tRPC router — dimensions, comparisons, and scores.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  CreateDimensionSchema,
  UpdateDimensionSchema,
  RecordComparisonSchema,
  ComparisonQuerySchema,
  ComparisonHistoryQuerySchema,
  DeleteComparisonSchema,
  BlacklistMovieSchema,
  ScoreQuerySchema,
  RandomPairQuerySchema,
  SmartPairQuerySchema,
  RankingsQuerySchema,
  DimensionExclusionSchema,
  StalenessSchema,
  RecordSkipSchema,
  GetDebriefOpponentSchema,
  GetDebriefSchema,
  GetTierListMoviesSchema,
  SubmitTierListSchema,
  DismissDebriefDimensionSchema,
  RecordDebriefComparisonSchema,
  toDimension,
  toComparison,
  toMediaScore,
} from "./types.js";
import * as service from "./service.js";
import * as stalenessService from "./staleness.js";
import * as debriefService from "../debrief/service.js";
import { NotFoundError, ConflictError, ValidationError } from "../../../shared/errors.js";

const DEFAULT_LIMIT = 50;

export const comparisonsRouter = router({
  /** List all dimensions ordered by sort_order. */
  listDimensions: protectedProcedure.query(() => {
    const rows = service.listDimensions();
    return { data: rows.map(toDimension) };
  }),

  /** Create a new dimension. */
  createDimension: protectedProcedure.input(CreateDimensionSchema).mutation(({ input }) => {
    try {
      const row = service.createDimension(input);
      return { data: toDimension(row), message: "Dimension created" };
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  /** Update a dimension. */
  updateDimension: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), data: UpdateDimensionSchema }))
    .mutation(({ input }) => {
      try {
        const row = service.updateDimension(input.id, input.data);
        return { data: toDimension(row), message: "Dimension updated" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Record a 1v1 comparison (updates Elo scores). */
  record: protectedProcedure.input(RecordComparisonSchema).mutation(({ input }) => {
    try {
      const row = service.recordComparison(input);
      return { data: toComparison(row), message: "Comparison recorded" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof ValidationError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      }
      throw err;
    }
  }),

  /** List comparisons for a media item. */
  listForMedia: protectedProcedure.input(ComparisonQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const { rows, total } = service.listComparisonsForMedia(
      input.mediaType,
      input.mediaId,
      input.dimensionId,
      limit,
      offset
    );
    return {
      data: rows.map(toComparison),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** List all comparisons (paginated, optional dimension filter). */
  listAll: protectedProcedure.input(ComparisonHistoryQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0;
    const { rows, total } = service.listAllComparisons(input.dimensionId, limit, offset);
    return {
      data: rows.map(toComparison),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Delete a comparison and recalculate Elo scores. */
  delete: protectedProcedure.input(DeleteComparisonSchema).mutation(({ input }) => {
    try {
      service.deleteComparison(input.id);
      return { message: "Comparison deleted and scores recalculated" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Blacklist a movie: mark watch events + purge comparisons + recalculate Elo. */
  blacklistMovie: protectedProcedure.input(BlacklistMovieSchema).mutation(({ input }) => {
    const result = service.blacklistMovie(input.mediaType, input.mediaId);
    return { data: result, message: "Movie blacklisted and comparisons purged" };
  }),

  /** Get a random pair of watched movies for comparison. */
  getRandomPair: protectedProcedure.input(RandomPairQuerySchema).query(({ input }) => {
    try {
      const pair = service.getRandomPair(input.dimensionId, input.avoidRecent);
      if (!pair) {
        return { data: null, reason: "insufficient_watched_movies" as const };
      }
      return { data: pair, reason: null };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Get a smart pair using weighted probabilistic selection. */
  getSmartPair: protectedProcedure.input(SmartPairQuerySchema).query(({ input }) => {
    try {
      const pair = service.getSmartPair(input.dimensionId);
      if (!pair) {
        return { data: null, reason: "insufficient_watched_movies" as const };
      }
      return { data: pair, reason: null };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
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
      service.excludeFromDimension(input.mediaType, input.mediaId, input.dimensionId);
      return { message: "Media excluded from dimension" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Re-include a media item in a dimension. */
  includeInDimension: protectedProcedure.input(DimensionExclusionSchema).mutation(({ input }) => {
    try {
      service.includeInDimension(input.mediaType, input.mediaId, input.dimensionId);
      return { message: "Media included in dimension" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
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
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Get up to 8 movies for a tier list placement round. */
  getTierListMovies: protectedProcedure.input(GetTierListMoviesSchema).query(({ input }) => {
    try {
      const movies = service.getTierListMovies(input.dimensionId);
      return { data: movies };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Submit a tier list: converts placements to pairwise comparisons + tier overrides. */
  submitTierList: protectedProcedure.input(SubmitTierListSchema).mutation(({ input }) => {
    try {
      const result = service.submitTierList(input);
      return { data: result, message: "Tier list submitted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof ValidationError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      }
      throw err;
    }
  }),

  /** Record a debrief comparison (or skip) for a session + dimension. */
  recordDebriefComparison: protectedProcedure
    .input(RecordDebriefComparisonSchema)
    .mutation(({ input }) => {
      try {
        const result = service.recordDebriefComparison(input);
        return { data: result, message: "Debrief comparison recorded" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof ValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  /** Record a skip (puts pair on cooloff for 10 global comparisons). */
  recordSkip: protectedProcedure.input(RecordSkipSchema).mutation(({ input }) => {
    try {
      const skipUntil = service.recordSkip(
        input.dimensionId,
        input.mediaAType,
        input.mediaAId,
        input.mediaBType,
        input.mediaBId
      );
      return { data: { skipUntil }, message: "Skip recorded" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Get a debrief session with movie info, dimensions, and opponents. */
  getDebrief: protectedProcedure.input(GetDebriefSchema).query(({ input }) => {
    try {
      const debrief = debriefService.getDebrief(input.sessionId);
      return { data: debrief };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Dismiss a debrief dimension (skip without comparing). */
  dismissDebriefDimension: protectedProcedure
    .input(DismissDebriefDimensionSchema)
    .mutation(({ input }) => {
      try {
        service.dismissDebriefDimension(input.sessionId, input.dimensionId);
        return { message: "Dimension dismissed" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof ValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),
});
