/**
 * Import service — entity matching, deduplication, and SQLite writes.
 */
import { entities } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { formatImportError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';
import { executeImportCore } from './execute-service.js';
import { processImportCore } from './process-service.js';
import { updateProgress } from './progress-store.js';

import type {
  ConfirmedTransaction,
  CreateEntityOutput,
  ExecuteImportOutput,
  ParsedTransaction,
  ProcessImportOutput,
} from './types.js';

export {
  applyLearnedCorrection,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
} from './lib/correction-application.js';
export { commitImport } from './lib/transaction-persistence.js';

/**
 * Process import batch: deduplicate and match entities.
 */
export async function processImport(
  transactions: ParsedTransaction[],
  account: string
): Promise<ProcessImportOutput> {
  const importBatchId = `import-${Date.now()}-${Math.random().toString(36).slice(7)}`;
  const { output } = await processImportCore({ transactions, account, importBatchId });
  return output;
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
 */
export function createEntity(name: string): CreateEntityOutput {
  const db = getDrizzle();
  const entityId = crypto.randomUUID();
  db.insert(entities)
    .values({ id: entityId, name, lastEditedTime: new Date().toISOString() })
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
      onProgress: (update) => updateProgress(sessionId, update),
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
      onProgress: (update) => updateProgress(sessionId, update),
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
