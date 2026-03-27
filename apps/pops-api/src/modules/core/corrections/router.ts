/**
 * Corrections tRPC router - CRUD for transaction corrections
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  CreateCorrectionSchema,
  UpdateCorrectionSchema,
  FindCorrectionSchema,
  toCorrection,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../../shared/errors.js";
import { generateRules } from "./lib/rule-generator.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const correctionsRouter = router({
  /** List all corrections with optional confidence filter */
  list: protectedProcedure
    .input(
      z.object({
        minConfidence: z.number().min(0).max(1).optional(),
        matchType: z.enum(["exact", "contains", "regex"]).optional(),
        limit: z.coerce.number().positive().optional(),
        offset: z.coerce.number().nonnegative().optional(),
      })
    )
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = service.listCorrections(
        input.minConfidence,
        limit,
        offset,
        input.matchType
      );

      return {
        data: rows.map(toCorrection),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single correction by ID */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getCorrection(input.id);
      return { data: toCorrection(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Find best matching correction for a description */
  findMatch: protectedProcedure.input(FindCorrectionSchema).query(({ input }) => {
    const row = service.findMatchingCorrection(input.description, input.minConfidence);

    if (!row) {
      return { data: null };
    }

    return { data: toCorrection(row) };
  }),

  /** Create or update a correction */
  createOrUpdate: protectedProcedure.input(CreateCorrectionSchema).mutation(({ input }) => {
    const row = service.createOrUpdateCorrection(input);
    return {
      data: toCorrection(row),
      message: "Correction saved",
    };
  }),

  /** Update an existing correction */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateCorrectionSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateCorrection(input.id, input.data);
        return {
          data: toCorrection(row),
          message: "Correction updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a correction */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteCorrection(input.id);
      return { message: "Correction deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Adjust confidence score */
  adjustConfidence: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        delta: z.number().min(-1).max(1),
      })
    )
    .mutation(({ input }) => {
      try {
        service.adjustConfidence(input.id, input.delta);
        return { message: "Confidence adjusted" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Generate proposed correction rules from a batch of transactions using Claude Haiku.
   * Does NOT save the rules — caller must confirm via createOrUpdate.
   */
  generateRules: protectedProcedure
    .input(
      z.object({
        transactions: z
          .array(
            z.object({
              description: z.string(),
              entityName: z.string().nullable(),
              amount: z.number(),
              account: z.string(),
              currentTags: z.array(z.string()),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ input }) => {
      const proposals = await generateRules(input.transactions);
      return { proposals };
    }),
});
