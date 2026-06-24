/**
 * Import processing core — dedup + entity matching (pure read flow, no writes).
 *
 * Dedup routes through the pillar's `importsService`; the entity-match maps are
 * built from the contact set fetched live from the contacts pillar per run (no
 * mirror); per-row classification through `process-transaction.ts`.
 */
import { type FinanceDb, importsService } from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { processTransactionSafely } from './process-transaction.js';
import {
  appendBatchItem,
  buildAiUsage,
  buildAiWarnings,
  makeBuckets,
  type ProcessBuckets,
  type ProgressBatchItem,
} from './processing-helpers.js';
import { loadKnownTags } from './tag-management.js';
import { createAiCounters } from './types.js';

import type { updateProgress } from './progress-store.js';
import type {
  AiCounters,
  ErrorEntry,
  ParsedTransaction,
  ProcessContext,
  ProcessedTransaction,
  ProcessImportOutput,
} from './types.js';

type ImportProgressUpdate = Parameters<typeof updateProgress>[1];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

export interface ProcessCoreInput {
  db: FinanceDb;
  contacts: ContactsClient;
  transactions: ParsedTransaction[];
  account: string;
  importBatchId: string;
  onProgress?: ImportProgressCallback;
}

export interface ProcessCoreOutput {
  output: ProcessImportOutput;
  errors: ErrorEntry[];
  processedNewCount: number;
}

function partitionByChecksum(
  db: FinanceDb,
  transactions: ParsedTransaction[]
): { newTransactions: ParsedTransaction[]; duplicates: ParsedTransaction[] } {
  const existing = importsService.findExistingChecksums(
    db,
    transactions.map((t) => t.checksum)
  );
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
  db: FinanceDb;
  newTransactions: ParsedTransaction[];
  context: ProcessContext;
  counters: AiCounters;
  buckets: ProcessBuckets;
  onProgress?: ImportProgressCallback;
}

async function runProcessLoop(args: ProcessLoopArgs): Promise<{ errors: ErrorEntry[] }> {
  const { db, newTransactions, context, counters, buckets, onProgress } = args;
  const currentBatch: ProgressBatchItem[] = [];
  const errors: ErrorEntry[] = [];

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

    const result = await processTransactionSafely({ db, transaction, context, counters });
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
  const { db, contacts, transactions, importBatchId, onProgress } = args;

  onProgress?.({ currentStep: 'deduplicating', processedCount: 0 });
  const { newTransactions, duplicates } = partitionByChecksum(db, transactions);

  onProgress?.({ currentStep: 'matching', processedCount: 0 });
  const contactSet = await contacts.fetchAllEntities();
  const { entityLookup, aliasMap: aliases } = importsService.buildEntityMaps(contactSet);
  const entityDefaultTags = importsService.buildDefaultTagsByEntity(contactSet);
  const knownTags = loadKnownTags(db);

  const buckets = makeBuckets();
  buckets.skipped = buildSkippedBucket(duplicates);

  const counters = createAiCounters();
  const context: ProcessContext = {
    entityLookup,
    aliases,
    knownTags,
    importBatchId,
    entityDefaultTags,
  };

  const { errors } = await runProcessLoop({
    db,
    newTransactions,
    context,
    counters,
    buckets,
    onProgress,
  });

  const warnings = buildAiWarnings(counters);
  return {
    output: {
      ...buckets,
      warnings: warnings.length > 0 ? warnings : undefined,
      aiUsage: buildAiUsage(counters),
    },
    errors,
    processedNewCount: newTransactions.length,
  };
}
