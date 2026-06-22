/**
 * Import service orchestration — background process/execute with progress
 * streaming into the in-memory progress store, plus the thin `createEntity`
 * shim.
 *
 * Ported from the monolith `service.ts`, db-injected. The handler kicks these
 * off (returning a session id immediately) and the FE polls `getImportProgress`.
 */
import { type FinanceDb } from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { executeImportCore } from './execute-service.js';
import { formatImportError } from './format-error.js';
import { processImportCore } from './process-service.js';
import { updateProgress } from './progress-store.js';

import type { ConfirmedTransaction, CreateEntityOutput, ParsedTransaction } from './types.js';

export { commitImport } from './commit.js';
export { reevaluateImportSessionResult, reevaluateImportSessionWithRules } from './reevaluate.js';

/**
 * Create a new contact during an import session via the contacts pillar
 * (create-or-fetch-by-name). The `type` defaults to `company`, matching the
 * former minimal insert. Returns the contact id + original-case name.
 */
export async function createEntity(
  contacts: ContactsClient,
  name: string
): Promise<CreateEntityOutput> {
  const { id, name: created } = await contacts.createOrFetchByName(name, 'company');
  return { entityId: id, entityName: created };
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

/** Arguments for {@link processImportWithProgress}. */
export interface ProcessImportWithProgressArgs {
  db: FinanceDb;
  contacts: ContactsClient;
  sessionId: string;
  transactions: ParsedTransaction[];
  account: string;
}

/** Run a process import with progress updates, then mark the session completed/failed. */
export async function processImportWithProgress(
  args: ProcessImportWithProgressArgs
): Promise<void> {
  const { db, contacts, sessionId, transactions, account } = args;
  try {
    const {
      output: result,
      errors,
      processedNewCount,
    } = await processImportCore({
      db,
      contacts,
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
