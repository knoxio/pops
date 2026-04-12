/**
 * Corrections tRPC router - CRUD for transaction corrections
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import { logger } from "../../../lib/logger.js";
import {
  CreateCorrectionSchema,
  UpdateCorrectionSchema,
  FindCorrectionSchema,
  CorrectionSignalSchema,
  ChangeSetSchema,
  ChangeSetImpactSummarySchema,
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
   *
   * Implemented as a .mutation() (POST) rather than a .query() (GET) despite
   * being a pure read. Reason: large import sessions produce input payloads
   * that blow past the httpBatchLink URL budget (2083 bytes), causing tRPC
   * to throw "Input is too big for a single dispatch". POST has no URL
   * length limit, so we can preview a full session in one call. The endpoint
   * is still side-effect free; the mutation verb is purely a transport
   * mechanism. Callers should treat the result as cacheable.
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
          .max(2000),
        minConfidence: z.number().min(0).max(1).default(0.7),
        /** Optional pending ChangeSets to merge with DB rules before preview.
         *  When provided, the "before" baseline includes the cumulative effect
         *  of these ChangeSets applied in order on top of the DB rules. */
        pendingChangeSets: z
          .array(z.object({ changeSet: ChangeSetSchema }))
          .max(200)
          .optional(),
      })
    )
    .mutation(({ input, ctx }) => {
      // We need the full current rule set for deterministic previews.
      // We fetch in a single page for simplicity; if this ever grows beyond the limit,
      // switch this to a dedicated "list all corrections" service method with pagination.
      const dbRules = service.listCorrections(undefined, PREVIEW_RULES_FETCH_LIMIT, 0).rows;

      // Merge pending ChangeSets into the baseline if provided (PRD-030 US-08).
      const baselineRules =
        input.pendingChangeSets && input.pendingChangeSets.length > 0
          ? input.pendingChangeSets.reduce(
              (acc, pcs) => service.applyChangeSetToRules(acc, pcs.changeSet),
              dbRules
            )
          : dbRules;

      try {
        const result = service.previewChangeSetImpact({
          rules: baselineRules,
          changeSet: input.changeSet,
          transactions: input.transactions,
          minConfidence: input.minConfidence,
        });
        logger.info({
          event: "corrections.proposal.preview",
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          transactionCount: input.transactions.length,
          minConfidence: input.minConfidence,
          impactSummary: result.summary,
        });
        return result;
      } catch (err) {
        logger.error({
          event: "corrections.proposal.preview",
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          transactionCount: input.transactions.length,
          minConfidence: input.minConfidence,
          err,
        });
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
    .mutation(({ input, ctx }) => {
      try {
        const rows = service.applyChangeSet(input.changeSet);
        logger.info({
          event: "corrections.proposal.apply",
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          outcome: "approved",
          resultRuleCount: rows.length,
        });
        return { data: rows.map(toCorrection), message: "ChangeSet applied" };
      } catch (err) {
        logger.error({
          event: "corrections.proposal.apply",
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          outcome: "apply_failed",
          err,
        });
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
        signal: CorrectionSignalSchema,
        minConfidence: z.number().min(0).max(1).default(0.7),
        maxPreviewItems: z.coerce.number().int().positive().max(500).default(200),
      })
    )
    .query(async ({ input }) => {
      try {
        return await service.proposeChangeSetFromCorrectionSignal({
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

  /**
   * Revise an in-progress ChangeSet via a free-text AI helper instruction.
   *
   * Implemented as a .mutation() (POST) because:
   * - It hits the LLM, so it is a write-like external side-effecting call.
   * - ChangeSets and triggering-transaction lists can be large, which would blow
   *   past the httpBatchLink URL budget if dispatched as a .query() (GET).
   *
   * The revised ChangeSet is NEVER applied automatically. The caller must still
   * drive approval through the existing apply path (US-03).
   */
  reviseChangeSet: protectedProcedure
    .input(
      z.object({
        signal: CorrectionSignalSchema,
        currentChangeSet: ChangeSetSchema,
        instruction: z.string().min(1).max(2000),
        triggeringTransactions: z
          .array(
            z.object({
              checksum: z.string().optional(),
              description: z.string(),
            })
          )
          .max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await service.reviseChangeSet({
          signal: input.signal,
          currentChangeSet: input.currentChangeSet,
          instruction: input.instruction,
          triggeringTransactions: input.triggeringTransactions,
        });
        logger.info({
          event: "corrections.proposal.revise",
          userEmail: ctx.user.email,
          instructionLength: input.instruction.length,
          inputOpCount: input.currentChangeSet.ops.length,
          outputOpCount: result.changeSet.ops.length,
          triggeringTransactionCount: input.triggeringTransactions.length,
        });
        return result;
      } catch (err) {
        logger.error({
          event: "corrections.proposal.revise",
          userEmail: ctx.user.email,
          instructionLength: input.instruction.length,
          inputOpCount: input.currentChangeSet.ops.length,
          triggeringTransactionCount: input.triggeringTransactions.length,
          err,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Failed to revise ChangeSet: ${err.message}`
              : "Failed to revise ChangeSet",
          cause: err,
        });
      }
    }),

  /**
   * Reject a proposed ChangeSet (audit only; applies no rule changes).
   * This provides traceability for rejection feedback even before the full proposal engine exists.
   */
  rejectChangeSet: protectedProcedure
    .input(
      z.object({
        signal: CorrectionSignalSchema,
        changeSet: ChangeSetSchema,
        feedback: z.string().min(1),
        impactSummary: ChangeSetImpactSummarySchema.optional(),
      })
    )
    .mutation(({ input, ctx }) => {
      try {
        service.persistRejectedChangeSetFeedback({
          signal: input.signal,
          changeSet: input.changeSet,
          feedback: input.feedback,
          impactSummary: input.impactSummary ?? null,
          userEmail: ctx.user.email,
        });
      } catch (err) {
        logger.error({
          event: "corrections.proposal.reject.persistence_failed",
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          err,
        });
      }
      logger.info({
        event: "corrections.proposal.reject",
        userEmail: ctx.user.email,
        opCount: input.changeSet.ops.length,
        ops: input.changeSet.ops,
        outcome: "rejected",
        feedback: input.feedback,
        impactSummary: input.impactSummary ?? null,
      });
      return { message: "ChangeSet rejected" };
    }),
});
