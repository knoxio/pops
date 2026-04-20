/**
 * Import processing service — entity matching, deduplication, and AI fallback.
 * Pure read flow (no writes); see commitImport / executeImport for the write side.
 */
import { logger } from '../../../lib/logger.js';
import { findExistingChecksums } from './lib/deduplication.js';
import { loadEntityMaps } from './lib/entity-lookup.js';
import {
  createAiCounters,
  processTransactionSafely,
  type AiCounters,
  type ProcessContext,
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

import type { updateProgress } from './progress-store.js';
import type { ParsedTransaction, ProcessedTransaction, ProcessImportOutput } from './types.js';

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
  errors: { description: string; error: string }[];
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
  result: Awaited<ReturnType<typeof processTransactionSafely>>
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
  errors: { description: string; error: string }[];
}> {
  const { newTransactions, context, counters, buckets, onProgress } = args;
  const currentBatch: ProgressBatchItem[] = [];
  const errors: { description: string; error: string }[] = [];

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

    const result = await processTransactionSafely({
      transaction,
      context,
      counters,
      index: i + 1,
      total: newTransactions.length,
    });

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

export async function processImportCore(args: ProcessCoreInput): Promise<ProcessCoreOutput> {
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
