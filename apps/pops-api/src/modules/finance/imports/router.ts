/**
 * tRPC router for import operations.
 *
 * Procedures:
 * - processImport: Deduplicate and match entities (no writes) - returns session ID for polling
 * - executeImport: Write confirmed transactions to SQLite - returns session ID for polling
 * - getImportProgress: Poll for import progress by session ID
 * - createEntity: Create new entity in SQLite
 * - commitImport: Atomically create entities, apply changeSets, and write transactions
 */
import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import {
  processImportInputSchema,
  executeImportInputSchema,
  createEntityInputSchema,
  applyChangeSetAndReevaluateInputSchema,
  commitPayloadSchema,
  type ProcessImportOutput,
} from "./types.js";
import {
  processImportWithProgress,
  executeImportWithProgress,
  createEntity,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
  commitImport,
} from "./service.js";
import { setProgress, getProgress, updateProgress } from "./progress-store.js";
import { applyChangeSet } from "../../core/corrections/service.js";
import { ChangeSetSchema } from "../../core/corrections/types.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";

function isProcessImportOutput(result: unknown): result is ProcessImportOutput {
  return (
    typeof result === "object" &&
    result !== null &&
    "matched" in result &&
    "uncertain" in result &&
    "failed" in result &&
    "skipped" in result
  );
}

export const importsRouter = router({
  /**
   * Process a batch of transactions:
   * 1. Deduplicate by checksum
   * 2. Match entities (aliases → exact → prefix → contains → AI)
   * 3. Categorize results: matched/uncertain/failed/skipped
   *
   * Returns session ID immediately, processing happens in background.
   * Use getImportProgress to poll for results.
   */
  processImport: protectedProcedure.input(processImportInputSchema).mutation(({ input }) => {
    const sessionId = crypto.randomUUID();

    // Initialize progress
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "deduplicating",
      totalTransactions: input.transactions.length,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    // Process in background (don't await)
    processImportWithProgress(sessionId, input.transactions, input.account).catch((error) => {
      console.error("[Import] Background processing failed:", error);
    });

    // Return session ID immediately
    return { sessionId };
  }),

  /**
   * Execute import: write confirmed transactions to SQLite
   *
   * Returns session ID immediately, writing happens in background.
   * Use getImportProgress to poll for results.
   */
  executeImport: protectedProcedure.input(executeImportInputSchema).mutation(({ input }) => {
    const sessionId = crypto.randomUUID();

    // Initialize progress
    setProgress(sessionId, {
      sessionId,
      status: "processing",
      currentStep: "writing",
      totalTransactions: input.transactions.length,
      processedCount: 0,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });

    // Execute synchronously (writes to SQLite, no network calls)
    executeImportWithProgress(sessionId, input.transactions);

    // Return session ID immediately
    return { sessionId };
  }),

  /**
   * Get import progress by session ID.
   * Poll this endpoint every 500ms to get real-time updates.
   */
  getImportProgress: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(({ input }) => {
      return getProgress(input.sessionId);
    }),

  /** Create a new entity in SQLite. */
  createEntity: protectedProcedure.input(createEntityInputSchema).mutation(({ input }) => {
    return createEntity(input.name);
  }),

  /**
   * Apply a bundled ChangeSet atomically, then immediately re-evaluate the current
   * import session's remaining transactions (uncertain/failed) using the same
   * deterministic matching stages as processing.
   */
  applyChangeSetAndReevaluate: protectedProcedure
    .input(applyChangeSetAndReevaluateInputSchema)
    .mutation(({ input }) => {
      const progress = getProgress(input.sessionId);
      if (!progress) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import session not found" });
      }
      if (progress.status !== "completed" || !progress.result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Import session is not ready for re-evaluation",
        });
      }

      // Ensure this is a processImport session (not executeImport).
      const result = progress.result;
      if (!isProcessImportOutput(result)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Import session result is not a processImport result",
        });
      }

      // 1) Apply ChangeSet atomically (DB transaction)
      // If this throws, we MUST NOT update the session result.
      try {
        applyChangeSet(input.changeSet);
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }

      // 2) Re-evaluate remaining transactions synchronously (no AI)
      const { nextResult, affectedCount } = reevaluateImportSessionResult({
        result,
        minConfidence: input.minConfidence,
      });

      updateProgress(input.sessionId, { result: nextResult });

      return { result: nextResult, affectedCount };
    }),

  /**
   * Commit an import atomically: create entities, apply rule changeSets,
   * and write transactions in a single SQLite transaction.
   */
  commitImport: protectedProcedure.input(commitPayloadSchema).mutation(({ input }) => {
    try {
      const result = commitImport(input);
      return { data: result, message: "Import committed" };
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      }
      throw err;
    }
  }),

  /**
   * Re-evaluate import session transactions using merged rules (DB + pending ChangeSets).
   * Used after browse-mode rule edits where ChangeSets are buffered locally.
   * Does NOT apply any ChangeSets to the DB — purely re-evaluates using merged rules.
   */
  reevaluateWithPendingRules: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        minConfidence: z.number().min(0).max(1).default(0.7),
        pendingChangeSets: z.array(z.object({ changeSet: ChangeSetSchema })).min(1),
      })
    )
    .mutation(({ input }) => {
      const progress = getProgress(input.sessionId);
      if (!progress) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import session not found" });
      }
      if (progress.status !== "completed" || !progress.result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Import session is not ready for re-evaluation",
        });
      }

      const result = progress.result;
      if (!isProcessImportOutput(result)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Import session result is not a processImport result",
        });
      }

      const { nextResult, affectedCount } = reevaluateImportSessionWithRules({
        result,
        minConfidence: input.minConfidence,
        pendingChangeSets: input.pendingChangeSets,
      });

      updateProgress(input.sessionId, { result: nextResult });

      return { result: nextResult, affectedCount };
    }),
});
