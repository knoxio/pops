/**
 * Import service — entity matching, deduplication, and SQLite writes.
 *
 * Key features:
 * - Universal entity matching (same algorithm for all banks)
 * - Checksum-based deduplication against SQLite
 * - AI fallback with full row context
 * - Batch writes to SQLite
 */
import { eq, and, isNotNull, ne, inArray, notInArray, asc } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { transactions, entities, tagVocabulary, transactionCorrections } from "@pops/db-types";
import { logger } from "../../../lib/logger.js";
import { formatImportError } from "../../../lib/errors.js";
import { matchEntity } from "./lib/entity-matcher.js";
import { loadEntityMaps } from "./lib/entity-lookup.js";
import { categorizeWithAi, AiCategorizationError } from "./lib/ai-categorizer.js";
import { updateProgress } from "./progress-store.js";
import {
  findMatchingCorrection,
  findMatchingCorrectionFromRules,
} from "../../core/corrections/service.js";
import { suggestTags } from "../../../shared/tag-suggester.js";
import type { TransactionRow } from "../transactions/types.js";
import { applyChangeSet } from "../../core/corrections/service.js";
import { ValidationError } from "../../../shared/errors.js";
import type {
  ParsedTransaction,
  ProcessedTransaction,
  ConfirmedTransaction,
  ProcessImportOutput,
  ExecuteImportOutput,
  CreateEntityOutput,
  ImportResult,
  ImportWarning,
  AiUsageStats,
  SuggestedTag,
  CommitPayload,
  CommitResult,
} from "./types.js";

export function reevaluateImportSessionResult(args: {
  result: ProcessImportOutput;
  minConfidence: number;
}): { nextResult: ProcessImportOutput; affectedCount: number } {
  const { result, minConfidence } = args;

  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  const nextMatched: ProcessedTransaction[] = [...result.matched];
  const nextUncertain: ProcessedTransaction[] = [];
  const nextFailed: ProcessedTransaction[] = [];

  let affectedCount = 0;

  const remaining: Array<{ tx: ProcessedTransaction; bucket: "uncertain" | "failed" }> = [
    ...result.uncertain.map((tx) => ({ tx, bucket: "uncertain" as const })),
    ...result.failed.map((tx) => ({ tx, bucket: "failed" as const })),
  ];

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    if (!item) continue;

    const prevTx = item.tx;
    const prevBucket = item.bucket;

    // Stage 1: Corrections (learned rules)
    const correctionApplied = applyLearnedCorrection({
      transaction: prevTx,
      minConfidence,
      knownTags,
      index: i + 1,
      total: remaining.length,
    });

    if (correctionApplied) {
      const nextBucket = correctionApplied.bucket;
      const nextTx = correctionApplied.processed;

      const changed =
        prevBucket !== nextBucket ||
        prevTx.status !== nextTx.status ||
        prevTx.transactionType !== nextTx.transactionType ||
        prevTx.entity.entityId !== nextTx.entity.entityId ||
        prevTx.entity.entityName !== nextTx.entity.entityName ||
        prevTx.entity.matchType !== nextTx.entity.matchType;

      if (changed) affectedCount += 1;

      if (nextBucket === "matched") nextMatched.push(nextTx);
      else nextUncertain.push(nextTx);
      continue;
    }

    // Stage 2: Universal entity matching (aliases → exact → prefix → contains).
    // We intentionally do NOT re-run AI in this synchronous path.
    const match = matchEntity(prevTx.description, entityLookup, aliases);
    if (match) {
      const entityEntry = entityLookup.get(match.entityName.toLowerCase());
      if (!entityEntry) {
        // If lookup is inconsistent, fall back to leaving it as-is rather than crashing the session.
        if (prevBucket === "failed") nextFailed.push(prevTx);
        else nextUncertain.push(prevTx);
        continue;
      }

      const nextTx: ProcessedTransaction = {
        ...prevTx,
        entity: {
          entityId: entityEntry.id,
          entityName: entityEntry.name,
          matchType: match.matchType,
        },
        status: "matched",
        error: undefined,
        suggestedTags: buildSuggestedTags(prevTx.description, entityEntry.id, [], null, knownTags),
      };

      const changed =
        prevTx.status !== nextTx.status ||
        prevTx.transactionType !== nextTx.transactionType ||
        prevTx.entity.entityId !== nextTx.entity.entityId ||
        prevTx.entity.entityName !== nextTx.entity.entityName ||
        prevTx.entity.matchType !== nextTx.entity.matchType;

      if (changed) affectedCount += 1;
      nextMatched.push(nextTx);
      continue;
    }

    // No deterministic match found: preserve current item as-is.
    if (prevBucket === "failed") nextFailed.push(prevTx);
    else nextUncertain.push(prevTx);
  }

  return {
    nextResult: {
      ...result,
      matched: nextMatched,
      uncertain: nextUncertain,
      failed: nextFailed,
    },
    affectedCount,
  };
}

/** Parse a JSON-encoded tags string from the corrections table into a string array. */
function parseCorrectionTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Build the suggested tags for a single transaction with source attribution.
 *
 * Priority: rule > ai > entity.
 * - rule: tags from a matched correction rule
 * - ai:   AI-returned category if it matches a tag already in the database
 * - entity: tags from suggestTags() that weren't already attributed above
 *
 * The "ai" match is case-insensitive against tags returned by availableTags
 * (i.e. what's actually in the transactions table), so no hardcoded list.
 */
/**
 * Load the flat list of all tag strings currently in the transactions table.
 * Called once per import batch; passed into buildSuggestedTags to avoid
 * repeated identical queries for every transaction.
 */
function loadKnownTags(): string[] {
  const db = getDrizzle();
  const rows = db
    .select({ tags: transactions.tags })
    .from(transactions)
    .where(and(isNotNull(transactions.tags), ne(transactions.tags, "[]")))
    .all();

  const seen = new Set<string>();

  const vocab = db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all();
  for (const row of vocab) {
    if (row.tag) seen.add(row.tag);
  }

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags) as unknown;
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (typeof t === "string") seen.add(t);
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return Array.from(seen);
}

function buildSuggestedTags(
  description: string,
  entityId: string | null,
  correctionTags: string[],
  aiCategory: string | null,
  knownTags: string[],
  correctionPattern?: string
): SuggestedTag[] {
  return suggestTags({
    description,
    entityId,
    aiCategory,
    knownTags,
    correctionTags,
    correctionPattern,
  });
}

export function applyLearnedCorrection(args: {
  transaction: ParsedTransaction;
  minConfidence: number;
  knownTags: string[];
  index: number;
  total: number;
}): { processed: ProcessedTransaction; bucket: "matched" | "uncertain" } | null {
  const { transaction, minConfidence, knownTags, index, total } = args;

  const correctionResult = findMatchingCorrection(transaction.description, minConfidence);
  if (!correctionResult) return null;

  const { correction, status } = correctionResult;
  const entityId = correction.entityId;

  if (!entityId) {
    // Transfer/income rules are allowed to classify without assigning an entity.
    if (correction.transactionType) {
      logger.debug(
        {
          index,
          total,
          description: transaction.description.substring(0, 50),
          transactionType: correction.transactionType,
          confidence: correction.confidence,
        },
        "[Import] Applied learned type-only correction"
      );

      return {
        processed: {
          ...transaction,
          location: correction.location ?? transaction.location,
          transactionType: correction.transactionType,
          entity: {
            matchType: "learned",
            confidence: correction.confidence,
          },
          ruleProvenance: {
            source: "correction",
            ruleId: correction.id,
            pattern: correction.descriptionPattern,
            matchType: correction.matchType,
            confidence: correction.confidence,
          },
          status: "matched",
          suggestedTags: buildSuggestedTags(
            transaction.description,
            null,
            parseCorrectionTags(correction.tags),
            null,
            knownTags,
            correction.descriptionPattern
          ),
        },
        bucket: "matched",
      };
    }

    logger.debug(
      {
        index,
        total,
        description: transaction.description.substring(0, 50),
        confidence: correction.confidence,
        status,
      },
      "[Import] Learned correction matched but has no entityId; falling through"
    );
    return null;
  }

  logger.debug(
    {
      index,
      total,
      description: transaction.description.substring(0, 50),
      entityName: correction.entityName,
      confidence: correction.confidence,
      status,
    },
    "[Import] Applied learned correction"
  );

  return {
    processed: {
      ...transaction,
      location: correction.location ?? transaction.location,
      entity: {
        entityId,
        entityName: correction.entityName ?? "Unknown",
        matchType: "learned",
        confidence: correction.confidence,
      },
      ruleProvenance: {
        source: "correction",
        ruleId: correction.id,
        pattern: correction.descriptionPattern,
        matchType: correction.matchType,
        confidence: correction.confidence,
      },
      status,
      suggestedTags: buildSuggestedTags(
        transaction.description,
        entityId,
        parseCorrectionTags(correction.tags),
        null,
        knownTags,
        correction.descriptionPattern
      ),
    },
    bucket: status === "matched" ? "matched" : "uncertain",
  };
}

// Entity lookup and alias loading moved to lib/entity-lookup.ts

/**
 * Query SQLite for existing checksums.
 * Returns set of checksums that already exist in the transactions table.
 */
function findExistingChecksums(checksums: string[]): Set<string> {
  if (checksums.length === 0) return new Set();

  const db = getDrizzle();
  const existingChecksums = new Set<string>();

  // Query in batches of 500 to avoid SQLite variable limits
  for (let i = 0; i < checksums.length; i += 500) {
    const batch = checksums.slice(i, i + 500);
    const rows = db
      .select({ checksum: transactions.checksum })
      .from(transactions)
      .where(inArray(transactions.checksum, batch))
      .all();

    for (const row of rows) {
      if (row.checksum) existingChecksums.add(row.checksum);
    }
  }

  return existingChecksums;
}

/** Insert a transaction directly into SQLite. Returns the created row. */
function insertTransaction(input: {
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  rawRow?: string;
  checksum?: string;
}): TransactionRow {
  const db = getDrizzle();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      amount: input.amount,
      date: input.date,
      type: input.type || "",
      tags: JSON.stringify(input.tags),
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();

  if (!row) throw new Error(`Insert succeeded but row not found: ${id}`);
  return row;
}

type ImportProgressUpdate = Parameters<typeof updateProgress>[1];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

async function processImportCore(args: {
  transactions: ParsedTransaction[];
  account: string;
  importBatchId: string;
  onProgress?: ImportProgressCallback;
}): Promise<{
  output: ProcessImportOutput;
  errors: Array<{ description: string; error: string }>;
  processedNewCount: number;
}> {
  const { transactions, account, importBatchId, onProgress } = args;

  logger.info(
    { importBatchId, account, totalCount: transactions.length },
    "[Import] Starting processImport"
  );

  // Step 1: Checksum-based deduplication against SQLite
  onProgress?.({ currentStep: "deduplicating", processedCount: 0 });
  logger.info(
    { checksumCount: transactions.length },
    "[Import] Querying SQLite for existing checksums"
  );
  const checksums = transactions.map((t) => t.checksum);
  const existingChecksums = findExistingChecksums(checksums);

  logger.info(
    {
      duplicateCount: existingChecksums.size,
      newCount: transactions.length - existingChecksums.size,
    },
    "[Import] Deduplication complete"
  );

  const newTransactions = transactions.filter((t) => !existingChecksums.has(t.checksum));
  const duplicates = transactions.filter((t) => existingChecksums.has(t.checksum));

  // Step 2: Load entity lookup, aliases, and known tags (once per batch)
  onProgress?.({ currentStep: "matching", processedCount: 0 });
  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  // Step 3: Match entities for each transaction
  const matched: ProcessedTransaction[] = [];
  const uncertain: ProcessedTransaction[] = [];
  const failed: ProcessedTransaction[] = [];
  const skipped: ProcessedTransaction[] = duplicates.map((t) => ({
    ...t,
    entity: { matchType: "none" as const },
    status: "skipped" as const,
    skipReason: "Duplicate transaction (checksum match)",
  }));

  // Track AI categorization issues and usage
  let aiError: AiCategorizationError | null = null;
  let aiFailureCount = 0;
  let aiApiCalls = 0;
  let aiCacheHits = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const currentBatch: Array<{
    description: string;
    status: "processing" | "success" | "failed";
    error?: string;
  }> = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    if (!transaction) continue;

    const batchItem: {
      description: string;
      status: "processing" | "success" | "failed";
      error?: string;
    } = {
      description: transaction.description.substring(0, 50),
      status: "processing",
    };

    if (onProgress) {
      currentBatch.push(batchItem);
      if (currentBatch.length > 5) currentBatch.shift();
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
    }

    try {
      // Step 1: Apply learned corrections (highest priority)
      // When a correction matches, skip all subsequent matching stages.
      const correctionApplied = applyLearnedCorrection({
        transaction,
        minConfidence: 0.7,
        knownTags,
        index: i + 1,
        total: newTransactions.length,
      });

      if (correctionApplied) {
        if (correctionApplied.bucket === "matched") matched.push(correctionApplied.processed);
        else uncertain.push(correctionApplied.processed);

        batchItem.status = "success";
        continue;
      }

      // Step 2: Try universal entity matching
      const match = matchEntity(transaction.description, entityLookup, aliases);

      if (match) {
        logger.debug(
          {
            index: i + 1,
            total: newTransactions.length,
            description: transaction.description.substring(0, 50),
            entityName: match.entityName,
            matchType: match.matchType,
          },
          "[Import] Entity matched"
        );

        const entityEntry = entityLookup.get(match.entityName.toLowerCase());
        if (!entityEntry) {
          throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
        }

        matched.push({
          ...transaction,
          entity: {
            entityId: entityEntry.id,
            entityName: entityEntry.name,
            matchType: match.matchType,
          },
          status: "matched",
          suggestedTags: buildSuggestedTags(
            transaction.description,
            entityEntry.id,
            [],
            null,
            knownTags
          ),
        });

        batchItem.status = "success";
      } else {
        // No match - try AI categorization
        let aiResult = null;

        try {
          const { result, usage } = await categorizeWithAi(transaction.rawRow, importBatchId);
          aiResult = result;

          if (usage) {
            aiApiCalls++;
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
            totalCostUsd += usage.costUsd;
          } else {
            aiCacheHits++;
          }
        } catch (error) {
          if (error instanceof AiCategorizationError) {
            aiError = error;
            aiFailureCount++;
          } else {
            throw error;
          }
        }

        if (aiResult && aiResult.entityName) {
          const entityEntry = entityLookup.get(aiResult.entityName.toLowerCase());

          if (entityEntry) {
            matched.push({
              ...transaction,
              entity: {
                entityId: entityEntry.id,
                entityName: entityEntry.name,
                matchType: "ai",
              },
              status: "matched",
              suggestedTags: buildSuggestedTags(
                transaction.description,
                entityEntry.id,
                [],
                aiResult.category,
                knownTags
              ),
            });

            batchItem.status = "success";
          } else {
            uncertain.push({
              ...transaction,
              entity: {
                entityName: aiResult.entityName,
                matchType: "ai",
                confidence: 0.7,
              },
              status: "uncertain",
              suggestedTags: buildSuggestedTags(
                transaction.description,
                null,
                [],
                aiResult.category,
                knownTags
              ),
            });

            batchItem.status = "success";
          }
        } else {
          const reason = aiError ? "AI categorization unavailable" : "No entity match found";
          uncertain.push({
            ...transaction,
            entity: { matchType: "none" },
            status: "uncertain",
            error: reason,
            suggestedTags: buildSuggestedTags(transaction.description, null, [], null, knownTags),
          });

          batchItem.status = "success";
        }
      }
    } catch (error) {
      failed.push({
        ...transaction,
        entity: { matchType: "none" },
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      batchItem.status = "failed";
      batchItem.error = error instanceof Error ? error.message : "Unknown error";

      if (onProgress) {
        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.substring(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        });
      }
    } finally {
      if (onProgress) onProgress({ currentBatch: [...currentBatch] });
    }
  }

  // Build warnings array
  const warnings: ImportWarning[] = [];
  if (aiError && aiFailureCount > 0) {
    warnings.push({
      type:
        aiError.code === "INSUFFICIENT_CREDITS" ? "AI_CATEGORIZATION_UNAVAILABLE" : "AI_API_ERROR",
      message: aiError.message,
      affectedCount: aiFailureCount,
    });
  }

  // Build AI usage stats if any AI calls were made
  const aiUsage: AiUsageStats | undefined =
    aiApiCalls > 0 || aiCacheHits > 0
      ? {
          apiCalls: aiApiCalls,
          cacheHits: aiCacheHits,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd,
          avgCostPerCall: aiApiCalls > 0 ? totalCostUsd / aiApiCalls : 0,
        }
      : undefined;

  logger.info(
    {
      importBatchId,
      matchedCount: matched.length,
      uncertainCount: uncertain.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
      aiApiCalls,
      aiCacheHits,
      totalCostUsd: totalCostUsd.toFixed(6),
    },
    "[Import] processImport complete"
  );

  return {
    output: {
      matched,
      uncertain,
      failed,
      skipped,
      warnings: warnings.length > 0 ? warnings : undefined,
      aiUsage,
    },
    errors,
    processedNewCount: newTransactions.length,
  };
}

/**
 * Process import batch: deduplicate and match entities
 */
export async function processImport(
  transactions: ParsedTransaction[],
  account: string
): Promise<ProcessImportOutput> {
  const importBatchId = `import-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const { output } = await processImportCore({ transactions, account, importBatchId });
  return output;
}

function executeImportCore(args: {
  transactions: ConfirmedTransaction[];
  onProgress?: ImportProgressCallback;
}): {
  output: ExecuteImportOutput;
  errors: Array<{ description: string; error: string }>;
  processedCount: number;
} {
  const { transactions, onProgress } = args;

  const results: ImportResult[] = [];
  let imported = 0;
  const skipped = 0;

  const currentBatch: Array<{
    description: string;
    status: "processing" | "success" | "failed";
    error?: string;
  }> = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    if (!transaction) continue;

    const batchItem: {
      description: string;
      status: "processing" | "success" | "failed";
      error?: string;
    } = {
      description: transaction.description.substring(0, 50),
      status: "processing",
    };

    if (onProgress) {
      currentBatch.push(batchItem);
      if (currentBatch.length > 5) currentBatch.shift();
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
    }

    try {
      const type =
        transaction.transactionType === "transfer"
          ? "Transfer"
          : transaction.transactionType === "income"
            ? "Income"
            : "Expense";

      const row = insertTransaction({
        description: transaction.description,
        account: transaction.account,
        amount: transaction.amount,
        date: transaction.date,
        type,
        tags: transaction.tags ?? [],
        entityId: transaction.entityId ?? null,
        entityName: transaction.entityName ?? null,
        location: transaction.location ?? null,
        rawRow: transaction.rawRow,
        checksum: transaction.checksum,
      });

      logger.debug(
        {
          index: i + 1,
          total: transactions.length,
          description: transaction.description.substring(0, 50),
          id: row.id,
        },
        "[Import] Transaction written"
      );

      results.push({ transaction, success: true, pageId: row.id });
      imported++;
      batchItem.status = "success";
    } catch (error) {
      logger.error(
        {
          index: i + 1,
          total: transactions.length,
          description: transaction.description.substring(0, 50),
          error: error instanceof Error ? error.message : String(error),
        },
        "[Import] Transaction write failed"
      );

      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ transaction, success: false, error: message });
      batchItem.status = "failed";
      batchItem.error = message;

      if (onProgress) {
        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.substring(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        });
      }
    } finally {
      if (onProgress) onProgress({ currentBatch: [...currentBatch] });
    }
  }

  const failed = results.filter((r) => !r.success);
  return {
    output: { imported, failed, skipped },
    errors,
    processedCount: transactions.length,
  };
}

/** Execute import: write confirmed transactions to SQLite. */
export function executeImport(transactions: ConfirmedTransaction[]): ExecuteImportOutput {
  logger.info({ totalCount: transactions.length }, "[Import] Starting executeImport");
  const { output } = executeImportCore({ transactions });
  logger.info(
    { imported: output.imported, failedCount: output.failed.length, skipped: output.skipped },
    "[Import] executeImport complete"
  );
  return output;
}

/**
 * Create a new entity in SQLite.
 * Returns the generated id and name.
 */
export function createEntity(name: string): CreateEntityOutput {
  const db = getDrizzle();
  const entityId = crypto.randomUUID();

  db.insert(entities)
    .values({
      id: entityId,
      name,
      lastEditedTime: new Date().toISOString(),
    })
    .run();

  return { entityId, entityName: name };
}

/**
 * Process import with real-time progress updates.
 * This is an async wrapper that updates progress store as transactions are processed.
 */
export async function processImportWithProgress(
  sessionId: string,
  transactions: ParsedTransaction[],
  account: string
): Promise<void> {
  try {
    const importBatchId = `import-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    logger.info(
      { importBatchId, sessionId, account, totalCount: transactions.length },
      "[Import] Starting background processImport"
    );

    const {
      output: result,
      errors,
      processedNewCount,
    } = await processImportCore({
      transactions,
      account,
      importBatchId,
      onProgress: (update) => updateProgress(sessionId, update),
    });

    logger.info(
      {
        importBatchId,
        sessionId,
        matchedCount: result.matched.length,
        uncertainCount: result.uncertain.length,
        failedCount: result.failed.length,
        skippedCount: result.skipped.length,
        aiApiCalls: result.aiUsage?.apiCalls ?? 0,
        aiCacheHits: result.aiUsage?.cacheHits ?? 0,
        totalCostUsd: (result.aiUsage?.totalCostUsd ?? 0).toFixed(6),
      },
      "[Import] Background processImport complete"
    );

    updateProgress(sessionId, {
      status: "completed",
      processedCount: processedNewCount, // Set final count to total new
      result,
      errors,
    });
  } catch (error) {
    logger.error(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      "[Import] Background processing failed"
    );

    const formattedError = formatImportError(error);
    updateProgress(sessionId, {
      status: "failed",
      errors: [
        {
          description: "System",
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        },
      ],
    });
  }
}

/**
 * Execute import with real-time progress updates.
 * Writes transactions directly to SQLite and updates progress store.
 */
export function executeImportWithProgress(
  sessionId: string,
  transactions: ConfirmedTransaction[]
): void {
  try {
    logger.info(
      { sessionId, totalCount: transactions.length },
      "[Import] Starting background executeImport"
    );

    updateProgress(sessionId, {
      currentStep: "writing",
      totalTransactions: transactions.length,
      processedCount: 0,
      currentBatch: [],
      errors: [],
    });
    const {
      output: result,
      errors,
      processedCount,
    } = executeImportCore({
      transactions,
      onProgress: (update) => updateProgress(sessionId, update),
    });

    logger.info(
      {
        sessionId,
        imported: result.imported,
        failedCount: result.failed.length,
        skipped: result.skipped,
      },
      "[Import] Background executeImport complete"
    );

    updateProgress(sessionId, {
      status: "completed",
      processedCount, // Set final count to total
      result,
      errors,
    });
  } catch (error) {
    logger.error(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      "[Import] Background execution failed"
    );

    const formattedError = formatImportError(error);
    updateProgress(sessionId, {
      status: "failed",
      errors: [
        {
          description: "System",
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Commit import (PRD-031 US-03) — atomic write of entities + rules + transactions
// ---------------------------------------------------------------------------

const TEMP_ENTITY_PREFIX = "temp:entity:";

/**
 * Validate a commit payload before executing the transaction.
 * Checks that all temp ID references in changeSets and transactions
 * can be resolved against the provided pending entities.
 */
function validateCommitPayload(payload: CommitPayload): void {
  const tempIds = new Set(payload.entities.map((e) => e.tempId));

  // Check for duplicate temp IDs
  if (tempIds.size !== payload.entities.length) {
    throw new ValidationError("Duplicate temp IDs in entities array");
  }

  // Check for duplicate entity names (case-insensitive)
  const names = new Set<string>();
  for (const entity of payload.entities) {
    const lower = entity.name.toLowerCase();
    if (names.has(lower)) {
      throw new ValidationError(`Duplicate entity name: '${entity.name}'`);
    }
    names.add(lower);
  }

  // Collect all temp entity ID references in changeSets and transactions
  const referencedTempIds = new Set<string>();

  for (const cs of payload.changeSets) {
    for (const op of cs.ops) {
      if (op.op === "add" && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
      if (op.op === "edit" && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
    }
  }

  for (const txn of payload.transactions) {
    if (txn.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
      referencedTempIds.add(txn.entityId);
    }
  }

  // Verify all referenced temp IDs exist in the entities array
  for (const ref of referencedTempIds) {
    if (!tempIds.has(ref)) {
      throw new ValidationError(`Unknown temp ID referenced: '${ref}'`);
    }
  }
}

/**
 * Replace temp entity IDs with real DB IDs in a ChangeSet's ops (returns a new ChangeSet).
 */
function resolveChangeSetTempIds(
  cs: CommitPayload["changeSets"][number],
  tempIdMap: Map<string, string>
): CommitPayload["changeSets"][number] {
  return {
    ...cs,
    ops: cs.ops.map((op) => {
      if (op.op === "add" && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      if (op.op === "edit" && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      return op;
    }),
  };
}

/**
 * Atomically commit an import: create entities, apply rule changeSets,
 * and write transactions inside a single SQLite transaction.
 */
export function commitImport(payload: CommitPayload): CommitResult {
  // Validate before starting the transaction
  validateCommitPayload(payload);

  const db = getDrizzle();

  return db.transaction(() => {
    // Phase 1: Create entities, build tempId -> realId map
    const tempIdMap = new Map<string, string>();
    let entitiesCreated = 0;

    for (const pending of payload.entities) {
      const { entityId } = createEntity(pending.name);
      tempIdMap.set(pending.tempId, entityId);
      entitiesCreated++;

      // Update entity type if not default
      if (pending.type !== "company") {
        db.update(entities).set({ type: pending.type }).where(eq(entities.id, entityId)).run();
      }
    }

    // Phase 2: Apply changeSets with resolved temp IDs
    const rulesApplied = { add: 0, edit: 0, disable: 0, remove: 0 };

    for (const cs of payload.changeSets) {
      const resolved = resolveChangeSetTempIds(cs, tempIdMap);
      applyChangeSet(resolved);

      // Count ops by type
      for (const op of resolved.ops) {
        rulesApplied[op.op]++;
      }
    }

    // Phase 3: Write transactions with resolved temp IDs
    let transactionsImported = 0;
    let transactionsFailed = 0;

    for (const txn of payload.transactions) {
      const entityId = txn.entityId?.startsWith(TEMP_ENTITY_PREFIX)
        ? (tempIdMap.get(txn.entityId) ?? txn.entityId)
        : txn.entityId;

      try {
        const type =
          txn.transactionType === "transfer"
            ? "Transfer"
            : txn.transactionType === "income"
              ? "Income"
              : "Expense";

        insertTransaction({
          description: txn.description,
          account: txn.account,
          amount: txn.amount,
          date: txn.date,
          type,
          tags: txn.tags ?? [],
          entityId: entityId ?? null,
          entityName: txn.entityName ?? null,
          location: txn.location ?? null,
          rawRow: txn.rawRow,
          checksum: txn.checksum,
        });

        transactionsImported++;
      } catch (error) {
        logger.error(
          {
            description: txn.description.substring(0, 50),
            error: error instanceof Error ? error.message : String(error),
          },
          "[CommitImport] Transaction write failed"
        );
        transactionsFailed++;
      }
    }

    // Phase 4: Retroactive reclassification — re-evaluate existing transactions
    // against the updated rule set and update any whose classification changed.
    const retroactiveReclassifications = reclassifyExistingTransactions(
      db,
      payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
    );

    return {
      entitiesCreated,
      rulesApplied,
      transactionsImported,
      transactionsFailed,
      retroactiveReclassifications,
    };
  });
}

const RECLASSIFY_BATCH_SIZE = 500;

/**
 * Re-evaluate all existing transactions against the current (updated) rule set.
 * Excludes transactions from the current import batch (by checksum).
 * Returns the count of transactions whose classification was updated.
 */
function reclassifyExistingTransactions(
  db: ReturnType<typeof getDrizzle>,
  importedChecksums: string[]
): number {
  // Fetch the full updated rule set
  const allRules = db
    .select()
    .from(transactionCorrections)
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  if (allRules.length === 0) return 0;

  let reclassified = 0;
  let offset = 0;

  while (true) {
    // Fetch existing transactions in batches, excluding current import's checksums
    let batchQuery = db
      .select({
        id: transactions.id,
        description: transactions.description,
        entityId: transactions.entityId,
        type: transactions.type,
        location: transactions.location,
      })
      .from(transactions)
      .$dynamic();

    if (importedChecksums.length > 0) {
      batchQuery = batchQuery.where(notInArray(transactions.checksum, importedChecksums));
    }

    const batch = batchQuery
      .orderBy(asc(transactions.id))
      .limit(RECLASSIFY_BATCH_SIZE)
      .offset(offset)
      .all();

    if (batch.length === 0) break;

    for (const txn of batch) {
      const match = findMatchingCorrectionFromRules(txn.description, allRules);

      if (!match) continue;

      const rule = match.correction;
      const newEntityId = rule.entityId ?? null;
      const newType = rule.transactionType
        ? rule.transactionType === "transfer"
          ? "Transfer"
          : rule.transactionType === "income"
            ? "Income"
            : "Expense"
        : null;
      const newLocation = rule.location ?? null;

      // Check if classification actually changed
      const entityChanged = newEntityId !== (txn.entityId ?? null);
      const typeChanged = newType !== null && newType !== txn.type;
      const locationChanged = newLocation !== null && newLocation !== (txn.location ?? null);

      if (!entityChanged && !typeChanged && !locationChanged) continue;

      const updates: Record<string, unknown> = {};
      if (entityChanged) {
        updates.entityId = newEntityId;
        updates.entityName = rule.entityName ?? null;
      }
      if (typeChanged) updates.type = newType;
      if (locationChanged) updates.location = newLocation;
      updates.lastEditedTime = new Date().toISOString();

      db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();

      reclassified++;
    }

    offset += RECLASSIFY_BATCH_SIZE;
  }

  return reclassified;
}
