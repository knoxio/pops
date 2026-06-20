/**
 * Import execution core — write confirmed transactions to SQLite.
 *
 * Ported from the monolith `execute-service.ts`, db-injected: writes route
 * through the pillar's `importsService.insertImportTransaction`.
 */
import { type FinanceDb, importsService } from '../../../db/index.js';
import { formatImportError } from './format-error.js';
import { appendBatchItem, type ProgressBatchItem } from './processing-helpers.js';

import type { updateProgress } from './progress-store.js';
import type {
  ConfirmedTransaction,
  ErrorEntry,
  ExecuteImportOutput,
  ImportResult,
} from './types.js';

type ImportProgressUpdate = Parameters<typeof updateProgress>[1];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

export interface ExecuteCoreInput {
  db: FinanceDb;
  transactions: ConfirmedTransaction[];
  onProgress?: ImportProgressCallback;
}

export interface ExecuteCoreOutput {
  output: ExecuteImportOutput;
  errors: ErrorEntry[];
  processedCount: number;
}

function resolveTransactionType(t: ConfirmedTransaction): string {
  if (t.transactionType === 'transfer') return 'Transfer';
  if (t.transactionType === 'income') return 'Income';
  return 'Expense';
}

function writeConfirmedTransaction(db: FinanceDb, transaction: ConfirmedTransaction): ImportResult {
  const row = importsService.insertImportTransaction(db, {
    description: transaction.description,
    account: transaction.account,
    amount: transaction.amount,
    date: transaction.date,
    type: resolveTransactionType(transaction),
    tags: transaction.tags ?? [],
    entityId: transaction.entityId ?? null,
    entityName: transaction.entityName ?? null,
    location: transaction.location ?? null,
    rawRow: transaction.rawRow,
    checksum: transaction.checksum,
  });
  return { transaction, success: true, pageId: row.id };
}

interface WriteAttempt {
  result: ImportResult;
  ok: boolean;
  message?: string;
  error?: unknown;
}

function tryWriteTransaction(db: FinanceDb, transaction: ConfirmedTransaction): WriteAttempt {
  try {
    return { result: writeConfirmedTransaction(db, transaction), ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { result: { transaction, success: false, error: message }, ok: false, message, error };
  }
}

function recordExecuteError(
  transaction: ConfirmedTransaction,
  attempt: WriteAttempt,
  errors: ErrorEntry[]
): void {
  const formatted = formatImportError(attempt.error ?? new Error(attempt.message), {
    transaction: transaction.description,
  });
  errors.push({
    description: transaction.description.slice(0, 50),
    error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
  });
}

export function executeImportCore(args: ExecuteCoreInput): ExecuteCoreOutput {
  const { db, transactions, onProgress } = args;
  const results: ImportResult[] = [];
  let imported = 0;
  const skipped = 0;

  const currentBatch: ProgressBatchItem[] = [];
  const errors: ErrorEntry[] = [];

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

    const attempt = tryWriteTransaction(db, transaction);
    results.push(attempt.result);

    if (attempt.ok) {
      imported++;
      batchItem.status = 'success';
    } else {
      batchItem.status = 'failed';
      batchItem.error = attempt.message;
      if (onProgress) recordExecuteError(transaction, attempt, errors);
    }

    if (onProgress) onProgress({ currentBatch: [...currentBatch] });
  }

  const failed = results.filter((r) => !r.success);
  return { output: { imported, failed, skipped }, errors, processedCount: transactions.length };
}
