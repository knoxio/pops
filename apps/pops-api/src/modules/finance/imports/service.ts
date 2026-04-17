/**
 * Import service — entity matching, deduplication, and SQLite writes.
 *
 * Key features:
 * - Universal entity matching (same algorithm for all banks)
 * - Checksum-based deduplication against SQLite
 * - AI fallback with full row context
 * - Batch writes to SQLite
 */
import { entities } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { formatImportError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';
import { AiCategorizationError, categorizeWithAi } from './lib/ai-categorizer.js';
import { applyLearnedCorrection } from './lib/correction-application.js';
import { findExistingChecksums } from './lib/deduplication.js';
import { loadEntityMaps } from './lib/entity-lookup.js';
import { matchEntity } from './lib/entity-matcher.js';
import { buildSuggestedTags, loadKnownTags } from './lib/tag-management.js';
import { insertTransaction } from './lib/transaction-persistence.js';
import { updateProgress } from './progress-store.js';

import type {
  AiUsageStats,
  ConfirmedTransaction,
  CreateEntityOutput,
  ExecuteImportOutput,
  ImportResult,
  ImportWarning,
  ParsedTransaction,
  ProcessedTransaction,
  ProcessImportOutput,
} from './types.js';

export {
  applyLearnedCorrection,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
} from './lib/correction-application.js';

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
    '[Import] Starting processImport'
  );

  // Step 1: Checksum-based deduplication against SQLite
  onProgress?.({ currentStep: 'deduplicating', processedCount: 0 });
  logger.info(
    { checksumCount: transactions.length },
    '[Import] Querying SQLite for existing checksums'
  );
  const checksums = transactions.map((t) => t.checksum);
  const existingChecksums = findExistingChecksums(checksums);

  logger.info(
    {
      duplicateCount: existingChecksums.size,
      newCount: transactions.length - existingChecksums.size,
    },
    '[Import] Deduplication complete'
  );

  const newTransactions = transactions.filter((t) => !existingChecksums.has(t.checksum));
  const duplicates = transactions.filter((t) => existingChecksums.has(t.checksum));

  // Step 2: Load entity lookup, aliases, and known tags (once per batch)
  onProgress?.({ currentStep: 'matching', processedCount: 0 });
  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  // Step 3: Match entities for each transaction
  const matched: ProcessedTransaction[] = [];
  const uncertain: ProcessedTransaction[] = [];
  const failed: ProcessedTransaction[] = [];
  const skipped: ProcessedTransaction[] = duplicates.map((t) => ({
    ...t,
    entity: { matchType: 'none' as const },
    status: 'skipped' as const,
    skipReason: 'Duplicate transaction (checksum match)',
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
    status: 'processing' | 'success' | 'failed';
    error?: string;
  }> = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    if (!transaction) continue;

    const batchItem: {
      description: string;
      status: 'processing' | 'success' | 'failed';
      error?: string;
    } = {
      description: transaction.description.slice(0, 50),
      status: 'processing',
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
        if (correctionApplied.bucket === 'matched') matched.push(correctionApplied.processed);
        else uncertain.push(correctionApplied.processed);

        batchItem.status = 'success';
        continue;
      }

      // Step 2: Try universal entity matching
      const match = matchEntity(transaction.description, entityLookup, aliases);

      if (match) {
        logger.debug(
          {
            index: i + 1,
            total: newTransactions.length,
            description: transaction.description.slice(0, 50),
            entityName: match.entityName,
            matchType: match.matchType,
          },
          '[Import] Entity matched'
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
          status: 'matched',
          suggestedTags: buildSuggestedTags(
            transaction.description,
            entityEntry.id,
            [],
            null,
            knownTags
          ),
        });

        batchItem.status = 'success';
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
                matchType: 'ai',
              },
              status: 'matched',
              suggestedTags: buildSuggestedTags(
                transaction.description,
                entityEntry.id,
                [],
                aiResult.category,
                knownTags
              ),
            });

            batchItem.status = 'success';
          } else {
            uncertain.push({
              ...transaction,
              entity: {
                entityName: aiResult.entityName,
                matchType: 'ai',
                confidence: 0.7,
              },
              status: 'uncertain',
              suggestedTags: buildSuggestedTags(
                transaction.description,
                null,
                [],
                aiResult.category,
                knownTags
              ),
            });

            batchItem.status = 'success';
          }
        } else {
          const reason = aiError ? 'AI categorization unavailable' : 'No entity match found';
          uncertain.push({
            ...transaction,
            entity: { matchType: 'none' },
            status: 'uncertain',
            error: reason,
            suggestedTags: buildSuggestedTags(transaction.description, null, [], null, knownTags),
          });

          batchItem.status = 'success';
        }
      }
    } catch (error) {
      failed.push({
        ...transaction,
        entity: { matchType: 'none' },
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      batchItem.status = 'failed';
      batchItem.error = error instanceof Error ? error.message : 'Unknown error';

      if (onProgress) {
        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.slice(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ''),
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
        aiError.code === 'INSUFFICIENT_CREDITS' ? 'AI_CATEGORIZATION_UNAVAILABLE' : 'AI_API_ERROR',
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
    '[Import] processImport complete'
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
  const importBatchId = `import-${Date.now()}-${Math.random().toString(36).slice(7)}`;
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
    status: 'processing' | 'success' | 'failed';
    error?: string;
  }> = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    if (!transaction) continue;

    const batchItem: {
      description: string;
      status: 'processing' | 'success' | 'failed';
      error?: string;
    } = {
      description: transaction.description.slice(0, 50),
      status: 'processing',
    };

    if (onProgress) {
      currentBatch.push(batchItem);
      if (currentBatch.length > 5) currentBatch.shift();
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
    }

    try {
      const type =
        transaction.transactionType === 'transfer'
          ? 'Transfer'
          : transaction.transactionType === 'income'
            ? 'Income'
            : 'Expense';

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
          description: transaction.description.slice(0, 50),
          id: row.id,
        },
        '[Import] Transaction written'
      );

      results.push({ transaction, success: true, pageId: row.id });
      imported++;
      batchItem.status = 'success';
    } catch (error) {
      logger.error(
        {
          index: i + 1,
          total: transactions.length,
          description: transaction.description.slice(0, 50),
          error: error instanceof Error ? error.message : String(error),
        },
        '[Import] Transaction write failed'
      );

      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ transaction, success: false, error: message });
      batchItem.status = 'failed';
      batchItem.error = message;

      if (onProgress) {
        const formattedError = formatImportError(error, { transaction: transaction.description });
        errors.push({
          description: transaction.description.slice(0, 50),
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ''),
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
  logger.info({ totalCount: transactions.length }, '[Import] Starting executeImport');
  const { output } = executeImportCore({ transactions });
  logger.info(
    { imported: output.imported, failedCount: output.failed.length, skipped: output.skipped },
    '[Import] executeImport complete'
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
    const importBatchId = `import-${Date.now()}-${Math.random().toString(36).slice(7)}`;

    logger.info(
      { importBatchId, sessionId, account, totalCount: transactions.length },
      '[Import] Starting background processImport'
    );

    const {
      output: result,
      errors,
      processedNewCount,
    } = await processImportCore({
      transactions,
      account,
      importBatchId,
      onProgress: (update) => {
        updateProgress(sessionId, update);
      },
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
      '[Import] Background processImport complete'
    );

    updateProgress(sessionId, {
      status: 'completed',
      processedCount: processedNewCount, // Set final count to total new
      result,
      errors,
    });
  } catch (error) {
    logger.error(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      '[Import] Background processing failed'
    );

    const formattedError = formatImportError(error);
    updateProgress(sessionId, {
      status: 'failed',
      errors: [
        {
          description: 'System',
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ''),
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
      '[Import] Starting background executeImport'
    );

    updateProgress(sessionId, {
      currentStep: 'writing',
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
      onProgress: (update) => {
        updateProgress(sessionId, update);
      },
    });

    logger.info(
      {
        sessionId,
        imported: result.imported,
        failedCount: result.failed.length,
        skipped: result.skipped,
      },
      '[Import] Background executeImport complete'
    );

    updateProgress(sessionId, {
      status: 'completed',
      processedCount, // Set final count to total
      result,
      errors,
    });
  } catch (error) {
    logger.error(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      '[Import] Background execution failed'
    );

    const formattedError = formatImportError(error);
    updateProgress(sessionId, {
      status: 'failed',
      errors: [
        {
          description: 'System',
          error:
            formattedError.message +
            (formattedError.suggestion ? ` - ${formattedError.suggestion}` : ''),
        },
      ],
    });
  }
}

export { commitImport } from './lib/transaction-persistence.js';
