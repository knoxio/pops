/**
 * tRPC router for import operations.
 *
 * Procedures:
 * - processImport: Deduplicate and match entities (no writes) - returns session ID for polling
 * - executeImport: Write confirmed transactions to SQLite - returns session ID for polling
 * - getImportProgress: Poll for import progress by session ID
 * - createEntity: Create new entity in SQLite
 */
import { z } from "zod";
import crypto from "crypto";
import { router, protectedProcedure } from "../../trpc.js";
import {
  processImportInputSchema,
  executeImportInputSchema,
  createEntityInputSchema,
} from "./types.js";
import { processImportWithProgress, executeImportWithProgress, createEntity } from "./service.js";
import { setProgress, getProgress } from "./progress-store.js";

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
});
