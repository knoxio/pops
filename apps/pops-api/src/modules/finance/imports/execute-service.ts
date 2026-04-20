import { formatImportError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';
import { appendBatchItem, type ProgressBatchItem } from './lib/processing-helpers.js';
import { insertTransaction } from './lib/transaction-persistence.js';

import type { updateProgress } from './progress-store.js';
import type { ConfirmedTransaction, ExecuteImportOutput, ImportResult } from './types.js';

type ImportProgressUpdate = Parameters<typeof updateProgress>[1];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

interface ExecuteCoreInput {
  transactions: ConfirmedTransaction[];
  onProgress?: ImportProgressCallback;
}

export interface ExecuteCoreOutput {
  output: ExecuteImportOutput;
  errors: { description: string; error: string }[];
  processedCount: number;
}

function resolveTransactionType(t: ConfirmedTransaction): string {
  if (t.transactionType === 'transfer') return 'Transfer';
  if (t.transactionType === 'income') return 'Income';
  return 'Expense';
}

function writeConfirmedTransaction(transaction: ConfirmedTransaction): { result: ImportResult } {
  const row = insertTransaction({
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
      { index, total, description: transaction.description.slice(0, 50), id: result.pageId },
      '[Import] Transaction written'
    );
    return { result, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { index, total, description: transaction.description.slice(0, 50), error: message },
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

function recordExecuteError(
  transaction: ConfirmedTransaction,
  writeResult: ReturnType<typeof tryWriteTransaction>,
  errors: { description: string; error: string }[]
): void {
  const formatted = formatImportError(writeResult.error ?? new Error(writeResult.message), {
    transaction: transaction.description,
  });
  errors.push({
    description: transaction.description.slice(0, 50),
    error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
  });
}

export function executeImportCore(args: ExecuteCoreInput): ExecuteCoreOutput {
  const { transactions, onProgress } = args;
  const results: ImportResult[] = [];
  let imported = 0;
  const skipped = 0;

  const currentBatch: ProgressBatchItem[] = [];
  const errors: { description: string; error: string }[] = [];

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
      if (onProgress) recordExecuteError(transaction, writeResult, errors);
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
