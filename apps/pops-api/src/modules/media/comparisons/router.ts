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
  ScoreQuerySchema,
  RandomPairQuerySchema,
  RankingsQuerySchema,
  toDimension,
  toComparison,
  toMediaScore,
} from "./types.js";
import * as service from "./service.js";
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
});
