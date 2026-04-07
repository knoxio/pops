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
  ChangeSetSchema,
  toCorrection,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../../shared/errors.js";
import { generateRules, analyzeCorrection } from "./lib/rule-generator.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const PREVIEW_RULES_FETCH_LIMIT = 50_000;

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

  /** Find best matching correction for a description (includes confidence classification) */
  findMatch: protectedProcedure.input(FindCorrectionSchema).query(({ input }) => {
    const result = service.findMatchingCorrection(input.description, input.minConfidence);

    if (!result) {
      return { data: null, status: null };
    }

    return { data: toCorrection(result.correction), status: result.status };
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
   * Analyze a single correction via Claude to suggest a matching pattern.
   * Returns { matchType, pattern, confidence } or null if AI unavailable.
   */
  analyzeCorrection: protectedProcedure
    .input(
      z.object({
        description: z.string().min(1),
        entityName: z.string().min(1),
        amount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await analyzeCorrection(input);
      return { data: result };
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

  /**
   * Preview impact of a ChangeSet against a set of transaction descriptions.
   * Deterministic: uses the same matching semantics as processing.
   */
  previewChangeSet: protectedProcedure
    .input(
      z.object({
        changeSet: ChangeSetSchema,
        transactions: z
          .array(
            z.object({
              checksum: z.string().optional(),
              description: z.string().min(1),
            })
          )
          .min(1)
          .max(500),
        minConfidence: z.number().min(0).max(1).default(0.7),
      })
    )
    .query(({ input }) => {
      // We need the full current rule set for deterministic previews.
      // We fetch in a single page for simplicity; if this ever grows beyond the limit,
      // switch this to a dedicated "list all corrections" service method with pagination.
      const dbRules = service.listCorrections(undefined, PREVIEW_RULES_FETCH_LIMIT, 0).rows;
      try {
        return service.previewChangeSetImpact({
          rules: dbRules,
          changeSet: input.changeSet,
          transactions: input.transactions,
          minConfidence: input.minConfidence,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Apply a ChangeSet atomically (single transaction).
   */
  applyChangeSet: protectedProcedure
    .input(z.object({ changeSet: ChangeSetSchema }))
    .mutation(({ input }) => {
      try {
        const rows = service.applyChangeSet(input.changeSet);
        return { data: rows.map(toCorrection), message: "ChangeSet applied" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Generate a bundled ChangeSet proposal from a correction signal.
   * Returns rationale + bounded impact preview (counts + affected list).
   */
  proposeChangeSet: protectedProcedure
    .input(
      z.object({
        signal: z.object({
          descriptionPattern: z.string().min(1),
          matchType: z.enum(["exact", "contains", "regex"]),
          entityId: z.string().nullable().optional(),
          entityName: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          tags: z.array(z.string()).optional(),
          transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
        }),
        minConfidence: z.number().min(0).max(1).default(0.7),
        maxPreviewItems: z.coerce.number().int().positive().max(500).default(200),
      })
    )
    .query(({ input }) => {
      try {
        return service.proposeChangeSetFromCorrectionSignal({
          signal: input.signal,
          minConfidence: input.minConfidence,
          maxPreviewItems: input.maxPreviewItems,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),
});
