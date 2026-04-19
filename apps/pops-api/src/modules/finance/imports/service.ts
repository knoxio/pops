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
import { applyLearnedCorrection } from './lib/correction-application.js';
import { findExistingChecksums } from './lib/deduplication.js';
import { loadEntityMaps } from './lib/entity-lookup.js';
import {
  createAiCounters,
  processTransactionSafely,
  type ProcessContext,
  type AiCounters,
} from './lib/process-transaction.js';
import {
  appendBatchItem,
  buildAiUsage,
  buildAiWarnings,
  makeBuckets,
  type ProcessBuckets,
  type ProgressBatchItem,
} from './lib/processing-helpers.js';
import { loadKnownTags } from './lib/tag-management.js';
import { insertTransaction } from './lib/transaction-persistence.js';
import { updateProgress } from './progress-store.js';

import type {
  ConfirmedTransaction,
  CreateEntityOutput,
  ExecuteImportOutput,
  ImportResult,
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

interface ProcessCoreInput {
  transactions: ParsedTransaction[];
  account: string;
  importBatchId: string;
  onProgress?: ImportProgressCallback;
}

interface ProcessCoreOutput {
  output: ProcessImportOutput;
  errors: Array<{ description: string; error: string }>;
  processedNewCount: number;
}

function partitionByChecksum(transactions: ParsedTransaction[]): {
  newTransactions: ParsedTransaction[];
  duplicates: ParsedTransaction[];
} {
  const checksums = transactions.map((t) => t.checksum);
  const existing = findExistingChecksums(checksums);
  return {
    newTransactions: transactions.filter((t) => !existing.has(t.checksum)),
    duplicates: transactions.filter((t) => existing.has(t.checksum)),
  };
}

function buildSkippedBucket(duplicates: ParsedTransaction[]): ProcessedTransaction[] {
  return duplicates.map((t) => ({
    ...t,
    entity: { matchType: 'none' as const },
    status: 'skipped' as const,
    skipReason: 'Duplicate transaction (checksum match)',
  }));
}

function pushClassified(
  buckets: ProcessBuckets,
  result: ReturnType<typeof processTransactionSafely> extends Promise<infer R> ? R : never
): void {
  if (result.matched) buckets.matched.push(result.matched);
  if (result.uncertain) buckets.uncertain.push(result.uncertain);
  if (result.failed) buckets.failed.push(result.failed);
}

interface ProcessLoopArgs {
  newTransactions: ParsedTransaction[];
  context: ProcessContext;
  counters: AiCounters;
  buckets: ProcessBuckets;
  onProgress?: ImportProgressCallback;
}

async function runProcessLoop(args: ProcessLoopArgs): Promise<{
  errors: Array<{ description: string; error: string }>;
}> {
  const { newTransactions, context, counters, buckets, onProgress } = args;
  const currentBatch: ProgressBatchItem[] = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    if (!transaction) continue;

    const batchItem: ProgressBatchItem = {
      description: transaction.description.slice(0, 50),
      status: 'processing',
    };

    if (onProgress) {
      appendBatchItem(currentBatch, batchItem);
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
    }

    const result = await processTransactionSafely(
      transaction,
      context,
      counters,
      i + 1,
      newTransactions.length
    );

    pushClassified(buckets, result);
    batchItem.status = result.batchStatus;
    if (result.errorEntry) {
      batchItem.error = result.errorEntry.error;
      if (onProgress) errors.push(result.errorEntry);
    }

    if (onProgress) onProgress({ currentBatch: [...currentBatch] });
  }

  return { errors };
}

async function processImportCore(args: ProcessCoreInput): Promise<ProcessCoreOutput> {
  const { transactions, account, importBatchId, onProgress } = args;

  logger.info(
    { importBatchId, account, totalCount: transactions.length },
    '[Import] Starting processImport'
  );

  onProgress?.({ currentStep: 'deduplicating', processedCount: 0 });
  const { newTransactions, duplicates } = partitionByChecksum(transactions);

  logger.info(
    { duplicateCount: duplicates.length, newCount: newTransactions.length },
    '[Import] Deduplication complete'
  );

  onProgress?.({ currentStep: 'matching', processedCount: 0 });
  const { entityLookup, aliasMap: aliases } = loadEntityMaps();
  const knownTags = loadKnownTags();

  const buckets = makeBuckets();
  buckets.skipped = buildSkippedBucket(duplicates);

  const counters = createAiCounters();
  const context: ProcessContext = { entityLookup, aliases, knownTags, importBatchId };

  const { errors } = await runProcessLoop({
    newTransactions,
    context,
    counters,
    buckets,
    onProgress,
  });

  const warnings = buildAiWarnings(counters);
  const aiUsage = buildAiUsage(counters);

  logger.info(
    {
      importBatchId,
      matchedCount: buckets.matched.length,
      uncertainCount: buckets.uncertain.length,
      failedCount: buckets.failed.length,
      skippedCount: buckets.skipped.length,
      aiApiCalls: counters.aiApiCalls,
      aiCacheHits: counters.aiCacheHits,
      totalCostUsd: counters.totalCostUsd.toFixed(6),
    },
    '[Import] processImport complete'
  );

  return {
    output: {
      ...buckets,
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

interface ExecuteCoreInput {
  transactions: ConfirmedTransaction[];
  onProgress?: ImportProgressCallback;
}

interface ExecuteCoreOutput {
  output: ExecuteImportOutput;
  errors: Array<{ description: string; error: string }>;
  processedCount: number;
}

function resolveTransactionType(t: ConfirmedTransaction): string {
  if (t.transactionType === 'transfer') return 'Transfer';
  if (t.transactionType === 'income') return 'Income';
  return 'Expense';
}

function writeConfirmedTransaction(transaction: ConfirmedTransaction): {
  result: ImportResult;
} {
  const type = resolveTransactionType(transaction);
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
  return { result: { transaction, success: true, pageId: row.id } };
}

function tryWriteTransaction(
  transaction: ConfirmedTransaction,
  index: number,
  total: number
): { result: ImportResult; ok: boolean; message?: string; error?: unknown } {
  try {
    const { result } = writeConfirmedTransaction(transaction);
    logger.debug(
      {
        index,
        total,
        description: transaction.description.slice(0, 50),
        id: result.pageId,
      },
      '[Import] Transaction written'
    );
    return { result, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        index,
        total,
        description: transaction.description.slice(0, 50),
        error: message,
      },
      '[Import] Transaction write failed'
    );
    return {
      result: { transaction, success: false, error: message },
      ok: false,
      message,
      error,
    };
  }
}

function executeImportCore(args: ExecuteCoreInput): ExecuteCoreOutput {
  const { transactions, onProgress } = args;

  const results: ImportResult[] = [];
  let imported = 0;
  const skipped = 0;

  const currentBatch: ProgressBatchItem[] = [];
  const errors: Array<{ description: string; error: string }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    if (!transaction) continue;

    const batchItem: ProgressBatchItem = {
      description: transaction.description.slice(0, 50),
      status: 'processing',
    };

    if (onProgress) {
      appendBatchItem(currentBatch, batchItem);
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
    }

    const writeResult = tryWriteTransaction(transaction, i + 1, transactions.length);
    results.push(writeResult.result);

    if (writeResult.ok) {
      imported++;
      batchItem.status = 'success';
    } else {
      batchItem.status = 'failed';
      batchItem.error = writeResult.message;
      if (onProgress) {
        const formatted = formatImportError(writeResult.error ?? new Error(writeResult.message), {
          transaction: transaction.description,
        });
        errors.push({
          description: transaction.description.slice(0, 50),
          error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
        });
      }
    }

    if (onProgress) onProgress({ currentBatch: [...currentBatch] });
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

function logBackgroundImportComplete(
  importBatchId: string,
  sessionId: string,
  result: ProcessImportOutput
): void {
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
}

function reportBackgroundFailure(sessionId: string, error: unknown, stage: string): void {
  logger.error({ sessionId, error: error instanceof Error ? error.message : String(error) }, stage);

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

    logBackgroundImportComplete(importBatchId, sessionId, result);

    updateProgress(sessionId, {
      status: 'completed',
      processedCount: processedNewCount,
      result,
      errors,
    });
  } catch (error) {
    reportBackgroundFailure(sessionId, error, '[Import] Background processing failed');
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
      processedCount,
      result,
      errors,
    });
  } catch (error) {
    reportBackgroundFailure(sessionId, error, '[Import] Background execution failed');
  }
}

export { commitImport } from './lib/transaction-persistence.js';
