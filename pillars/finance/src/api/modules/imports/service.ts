/**
 * Import service orchestration — background process/execute with progress
 * streaming into the in-memory progress store, plus the thin `createEntity`
 * shim.
 *
 * Ported from the monolith `service.ts`, db-injected. The handler kicks these
 * off (returning a session id immediately) and the FE polls `getImportProgress`.
 */
import { type FinanceDb, importsService } from '../../../db/index.js';
import { executeImportCore } from './execute-service.js';
import { formatImportError } from './format-error.js';
import { processImportCore } from './process-service.js';
import { updateProgress } from './progress-store.js';

import type { ConfirmedTransaction, CreateEntityOutput, ParsedTransaction } from './types.js';

export { commitImport } from './commit.js';
export { reevaluateImportSessionResult, reevaluateImportSessionWithRules } from './reevaluate.js';

/** Create a new entity during an import session. */
export function createEntity(db: FinanceDb, name: string): CreateEntityOutput {
  return importsService.createImportEntity(db, name);
}

function newImportBatchId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(7)}`;
}

function reportBackgroundFailure(sessionId: string, error: unknown): void {
  const formatted = formatImportError(error);
  updateProgress(sessionId, {
    status: 'failed',
    errors: [
      {
        description: 'System',
        error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
      },
    ],
  });
}

/** Run a process import with progress updates, then mark the session completed/failed. */
export async function processImportWithProgress(
  db: FinanceDb,
  sessionId: string,
  transactions: ParsedTransaction[],
  account: string
): Promise<void> {
  try {
    const {
      output: result,
      errors,
      processedNewCount,
    } = await processImportCore({
      db,
      transactions,
      account,
      importBatchId: newImportBatchId(),
      onProgress: (update) => updateProgress(sessionId, update),
    });

    updateProgress(sessionId, {
      status: 'completed',
      processedCount: processedNewCount,
      result,
      errors,
    });
  } catch (error) {
    reportBackgroundFailure(sessionId, error);
  }
}

/** Run an execute import with progress updates, then mark the session completed/failed. */
export function executeImportWithProgress(
  db: FinanceDb,
  sessionId: string,
  transactions: ConfirmedTransaction[]
): void {
  try {
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
      db,
      transactions,
      onProgress: (update) => updateProgress(sessionId, update),
    });

    updateProgress(sessionId, { status: 'completed', processedCount, result, errors });
  } catch (error) {
    reportBackgroundFailure(sessionId, error);
  }
}
