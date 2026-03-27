/**
 * Import service — entity matching, deduplication, and SQLite writes.
 *
 * Key features:
 * - Universal entity matching (same algorithm for all banks)
 * - Checksum-based deduplication against SQLite
 * - AI fallback with full row context
 * - Batch writes to SQLite
 */
import { eq, and, isNotNull, ne, inArray } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { transactions, entities } from "@pops/db-types";
import { logger } from "../../../lib/logger.js";
import { formatImportError } from "../../../lib/errors.js";
import { matchEntity } from "./lib/entity-matcher.js";
import { categorizeWithAi, AiCategorizationError } from "./lib/ai-categorizer.js";
import { updateProgress } from "./progress-store.js";
import { findMatchingCorrection } from "../../core/corrections/service.js";
import { suggestTags } from "../../../shared/tag-suggester.js";
import type { TransactionRow } from "../transactions/types.js";
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
} from "./types.js";

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
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];

  // 1. Correction rule tags
  for (const tag of correctionTags) {
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push({ tag, source: "rule", pattern: correctionPattern });
    }
  }

  // 2. AI category — only if it case-insensitively matches a tag already in the DB.
  //    knownTags is loaded once per import batch (not per-transaction).
  if (aiCategory) {
    const lowerCategory = aiCategory.toLowerCase();
    const matched = knownTags.find((t) => t.toLowerCase() === lowerCategory) ?? null;
    if (matched && !seen.has(matched)) {
      seen.add(matched);
      result.push({ tag: matched, source: "ai" });
    }
  }

  // 3. Entity default tags + correction tags via suggestTags — anything not already attributed
  const entitySuggestions = suggestTags(description, entityId);
  for (const tag of entitySuggestions) {
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push({ tag, source: "entity" });
    }
  }

  return result;
}

/**
 * Load entity lookup from SQLite: name → id
 */
function loadEntityLookup(): Record<string, string> {
  const db = getDrizzle();
  const rows = db.select({ name: entities.name, id: entities.id }).from(entities).all();

  const lookup: Record<string, string> = {};
  for (const row of rows) {
    lookup[row.name] = row.id;
  }
  return lookup;
}

/**
 * Load aliases from SQLite: alias → entity name
 * Aliases are stored as comma-separated strings in the aliases column
 */
function loadAliases(): Record<string, string> {
  const db = getDrizzle();
  const rows = db
    .select({ name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(isNotNull(entities.aliases))
    .all();

  const aliasMap: Record<string, string> = {};
  for (const row of rows) {
    if (!row.aliases) continue;
    const aliasList = row.aliases.split(",").map((a) => a.trim());
    for (const alias of aliasList) {
      aliasMap[alias] = row.name;
    }
  }
  return aliasMap;
}

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

/**
 * Process import batch: deduplicate and match entities
 */
export async function processImport(
  transactions: ParsedTransaction[],
  account: string
): Promise<ProcessImportOutput> {
  // Generate unique batch ID for tracking AI usage
  const importBatchId = `import-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  logger.info(
    { importBatchId, account, totalCount: transactions.length },
    "[Import] Starting processImport"
  );

  // Step 1: Checksum-based deduplication against SQLite
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
  const entityLookup = loadEntityLookup();
  const aliases = loadAliases();
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

  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    if (!transaction) continue;

    try {
      // Step 1: Apply learned corrections (highest priority)
      // When a correction matches, skip all subsequent matching stages.
      const correctionResult = findMatchingCorrection(transaction.description, 0.7);

      if (correctionResult) {
        const { correction, status } = correctionResult;
        const entityId = correction.entityId;
        if (entityId) {
          logger.debug(
            {
              index: i + 1,
              total: newTransactions.length,
              description: transaction.description.substring(0, 50),
              entityName: correction.entityName,
              confidence: correction.confidence,
              status,
            },
            "[Import] Applied learned correction"
          );

          matched.push({
            ...transaction,
            location: correction.location ?? transaction.location,
            entity: {
              entityId,
              entityName: correction.entityName ?? "Unknown",
              matchType: "learned" as never, // UI-only matchType
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
          });
          continue; // Skip all subsequent matching stages
        }
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
        // Good match - add to matched list
        const entityId = entityLookup[match.entityName];
        if (!entityId) {
          throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
        }

        matched.push({
          ...transaction,
          entity: {
            entityId,
            entityName: match.entityName,
            matchType: match.matchType,
          },
          status: "matched",
          suggestedTags: buildSuggestedTags(transaction.description, entityId, [], null, knownTags),
        });
      } else {
        // No match - try AI categorization
        let aiResult = null;

        try {
          const { result, usage } = await categorizeWithAi(transaction.rawRow, importBatchId);
          aiResult = result;

          // Track usage stats
          if (usage) {
            // API call made
            aiApiCalls++;
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
            totalCostUsd += usage.costUsd;
          } else {
            // Cache hit
            aiCacheHits++;
          }
        } catch (error) {
          // AI categorization failed - store error for warning
          if (error instanceof AiCategorizationError) {
            aiError = error;
            aiFailureCount++;
          } else {
            throw error; // Re-throw unexpected errors
          }
        }

        if (aiResult && aiResult.entityName) {
          // AI suggested an entity name - check if it exists in lookup
          const existingEntity = Object.keys(entityLookup).find(
            (name) => name.toUpperCase() === aiResult.entityName.toUpperCase()
          );

          if (existingEntity) {
            // AI matched to existing entity
            const entityId = entityLookup[existingEntity];
            if (!entityId) {
              throw new Error(`Entity lookup failed for AI match: ${existingEntity}`);
            }

            matched.push({
              ...transaction,
              entity: {
                entityId,
                entityName: existingEntity,
                matchType: "ai",
              },
              status: "matched",
              suggestedTags: buildSuggestedTags(
                transaction.description,
                entityId,
                [],
                aiResult.category,
                knownTags
              ),
            });
          } else {
            // AI suggested new entity name - add to uncertain
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
          }
        } else {
          // No entity match and AI failed or returned null — add to uncertain for human review.
          // AI failure (bad key, outage, quota) is not a hard transaction error; the user can
          // still assign an entity manually. Reserve "failed" for unrecoverable parse errors.
          uncertain.push({
            ...transaction,
            entity: { matchType: "none" },
            status: "uncertain",
            error: aiError ? "AI categorization unavailable" : "No entity match found",
            suggestedTags: buildSuggestedTags(transaction.description, null, [], null, knownTags),
          });
        }
      }
    } catch (error) {
      failed.push({
        ...transaction,
        entity: { matchType: "none" },
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Build warnings array
  const warnings: ImportWarning[] = [];

  // Add AI categorization errors
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
    matched,
    uncertain,
    failed,
    skipped,
    warnings: warnings.length > 0 ? warnings : undefined,
    aiUsage,
  };
}

/** Execute import: write confirmed transactions to SQLite. */
export function executeImport(transactions: ConfirmedTransaction[]): ExecuteImportOutput {
  logger.info({ totalCount: transactions.length }, "[Import] Starting executeImport");

  const results: ImportResult[] = [];
  let imported = 0;
  const skipped = 0;

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    if (!transaction) continue;

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
      results.push({
        transaction,
        success: true,
        pageId: row.id,
      });
      imported++;
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
      results.push({
        transaction,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const failed = results.filter((r) => !r.success);

  logger.info({ imported, failedCount: failed.length, skipped }, "[Import] executeImport complete");

  return { imported, failed, skipped };
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

    // Step 1: Deduplication against SQLite
    updateProgress(sessionId, { currentStep: "deduplicating", processedCount: 0 });

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

    // Step 2: Entity matching
    updateProgress(sessionId, { currentStep: "matching", processedCount: 0 });

    const entityLookup = loadEntityLookup();
    const aliases = loadAliases();
    const knownTags = loadKnownTags();

    const matched: ProcessedTransaction[] = [];
    const uncertain: ProcessedTransaction[] = [];
    const failed: ProcessedTransaction[] = [];
    const skipped: ProcessedTransaction[] = duplicates.map((t) => ({
      ...t,
      entity: { matchType: "none" as const },
      status: "skipped" as const,
      skipReason: "Duplicate transaction (checksum match)",
    }));

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

      // Update current batch (show up to 5 items)
      currentBatch.push(batchItem);
      if (currentBatch.length > 5) currentBatch.shift();

      updateProgress(sessionId, {
        processedCount: i + 1,
        currentBatch: [...currentBatch],
      });

      try {
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

          const entityId = entityLookup[match.entityName];
          if (!entityId) {
            throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
          }

          matched.push({
            ...transaction,
            entity: {
              entityId,
              entityName: match.entityName,
              matchType: match.matchType,
            },
            status: "matched",
            suggestedTags: buildSuggestedTags(
              transaction.description,
              entityId,
              [],
              null,
              knownTags
            ),
          });

          batchItem.status = "success";
        } else {
          // Try AI categorization
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
            const existingEntity = Object.keys(entityLookup).find(
              (name) => name.toUpperCase() === aiResult.entityName.toUpperCase()
            );

            if (existingEntity) {
              const entityId = entityLookup[existingEntity];
              if (!entityId) {
                throw new Error(`Entity lookup failed for AI match: ${existingEntity}`);
              }

              matched.push({
                ...transaction,
                entity: {
                  entityId,
                  entityName: existingEntity,
                  matchType: "ai",
                },
                status: "matched",
                suggestedTags: buildSuggestedTags(
                  transaction.description,
                  entityId,
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
            // No entity match and AI failed or returned null — uncertain for human review.
            // Same rationale as processImport: AI failure is not a hard transaction error.
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

        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.substring(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        });
      }

      // Update batch item status
      updateProgress(sessionId, { currentBatch: [...currentBatch] });
    }

    // Build warnings
    const warnings: ImportWarning[] = [];
    if (aiError && aiFailureCount > 0) {
      warnings.push({
        type:
          aiError.code === "INSUFFICIENT_CREDITS"
            ? "AI_CATEGORIZATION_UNAVAILABLE"
            : "AI_API_ERROR",
        message: aiError.message,
        affectedCount: aiFailureCount,
      });
    }

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

    const result: ProcessImportOutput = {
      matched,
      uncertain,
      failed,
      skipped,
      warnings: warnings.length > 0 ? warnings : undefined,
      aiUsage,
    };

    logger.info(
      {
        importBatchId,
        sessionId,
        matchedCount: matched.length,
        uncertainCount: uncertain.length,
        failedCount: failed.length,
        skippedCount: skipped.length,
        aiApiCalls,
        aiCacheHits,
        totalCostUsd: totalCostUsd.toFixed(6),
      },
      "[Import] Background processImport complete"
    );

    updateProgress(sessionId, {
      status: "completed",
      processedCount: newTransactions.length, // Set final count to total
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

      // Update current batch (show up to 5 items)
      currentBatch.push(batchItem);
      if (currentBatch.length > 5) currentBatch.shift();

      updateProgress(sessionId, {
        processedCount: i + 1,
        currentBatch: [...currentBatch],
      });

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

        results.push({
          transaction,
          success: true,
          pageId: row.id,
        });
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

        results.push({
          transaction,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        batchItem.status = "failed";
        batchItem.error = error instanceof Error ? error.message : "Unknown error";

        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.substring(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ""),
        });
      }

      // Update batch item status
      updateProgress(sessionId, { currentBatch: [...currentBatch] });
    }

    const failed = results.filter((r) => !r.success);

    const result: ExecuteImportOutput = { imported, failed, skipped };

    logger.info(
      { sessionId, imported, failedCount: failed.length, skipped },
      "[Import] Background executeImport complete"
    );

    updateProgress(sessionId, {
      status: "completed",
      processedCount: transactions.length, // Set final count to total
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
