/**
 * Handlers for the `imports.*` sub-router.
 *
 * processImport / executeImport mint a session id, seed the in-memory progress
 * store, kick off the work (process in the background; execute synchronously),
 * and return `{ sessionId }` immediately — the FE then polls getImportProgress.
 *
 * Error translation:
 *   - unknown session                       → 404 (finance.import.sessionNotFound)
 *   - session not completed / no result     → 412 (finance.import.sessionNotReady)
 *   - completed but wrong result type       → 412 (finance.import.sessionNotProcessResult)
 *   - correction/tag-rule NotFoundError      → 404 (propagated from the ChangeSet apply)
 *   - ValidationError (commit payload)       → 400 (propagated)
 */
import { randomUUID } from 'node:crypto';

import { type FinanceDb } from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import { applyChangeSet } from '../modules/corrections/index.js';
import {
  commitImport,
  createEntity,
  executeImportWithProgress,
  getProgress,
  processImportWithProgress,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
  setProgress,
  updateProgress,
} from '../modules/imports/index.js';
import { NotFoundError, PreconditionError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeImportsContract } from '../../contract/rest-imports.js';
import type { ImportProgress } from '../modules/imports/index.js';
import type { ProcessImportOutput } from '../modules/imports/types.js';

type Req = ServerInferRequest<typeof financeImportsContract>;

function isProcessImportOutput(result: unknown): result is ProcessImportOutput {
  return (
    typeof result === 'object' &&
    result !== null &&
    'matched' in result &&
    'uncertain' in result &&
    'failed' in result &&
    'skipped' in result
  );
}

/**
 * Resolve a completed processImport session or throw the matching HttpError.
 * Shared by applyChangeSetAndReevaluate + reevaluateWithPendingRules.
 */
function requireProcessSession(sessionId: string): {
  progress: ImportProgress;
  result: ProcessImportOutput;
} {
  const progress = getProgress(sessionId);
  if (!progress) {
    throw new NotFoundError('Import session', sessionId);
  }
  if (progress.status !== 'completed' || !progress.result) {
    throw new PreconditionError('Import session not ready', 'finance.import.sessionNotReady');
  }
  const result = progress.result;
  if (!isProcessImportOutput(result)) {
    throw new PreconditionError(
      'Import session result is not a process result',
      'finance.import.sessionNotProcessResult'
    );
  }
  return { progress, result };
}

export function makeImportsHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    processImport: ({ body }: Req['processImport']) =>
      runHttp(() => {
        const sessionId = randomUUID();
        setProgress(sessionId, {
          sessionId,
          status: 'processing',
          currentStep: 'deduplicating',
          totalTransactions: body.transactions.length,
          processedCount: 0,
          currentBatch: [],
          errors: [],
          startedAt: new Date().toISOString(),
        });
        processImportWithProgress({
          db,
          contacts,
          sessionId,
          transactions: body.transactions,
          account: body.account,
        }).catch((error) => {
          console.error(`[Import] Background processing failed: ${String(error)}`);
        });
        return { status: 200 as const, body: { sessionId } };
      }),

    executeImport: ({ body }: Req['executeImport']) =>
      runHttp(() => {
        const sessionId = randomUUID();
        setProgress(sessionId, {
          sessionId,
          status: 'processing',
          currentStep: 'writing',
          totalTransactions: body.transactions.length,
          processedCount: 0,
          currentBatch: [],
          errors: [],
          startedAt: new Date().toISOString(),
        });
        executeImportWithProgress(db, sessionId, body.transactions);
        return { status: 200 as const, body: { sessionId } };
      }),

    getImportProgress: ({ query }: Req['getImportProgress']) =>
      runHttp(() => ({ status: 200 as const, body: getProgress(query.sessionId) })),

    createEntity: ({ body }: Req['createEntity']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await createEntity(contacts, body.name),
      })),

    applyChangeSetAndReevaluate: ({ body }: Req['applyChangeSetAndReevaluate']) =>
      runHttp(async () => {
        const { result } = requireProcessSession(body.sessionId);
        applyChangeSet(db, body.changeSet);
        const { nextResult, affectedCount } = await reevaluateImportSessionResult({
          db,
          contacts,
          result,
          minConfidence: body.minConfidence,
        });
        updateProgress(body.sessionId, { result: nextResult });
        return { status: 200 as const, body: { result: nextResult, affectedCount } };
      }),

    commitImport: ({ body }: Req['commitImport']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await commitImport(db, contacts, body), message: 'Import committed' },
      })),

    reevaluateWithPendingRules: ({ body }: Req['reevaluateWithPendingRules']) =>
      runHttp(async () => {
        const { result } = requireProcessSession(body.sessionId);
        const { nextResult, affectedCount } = await reevaluateImportSessionWithRules({
          db,
          contacts,
          result,
          minConfidence: body.minConfidence,
          pendingChangeSets: body.pendingChangeSets,
        });
        updateProgress(body.sessionId, { result: nextResult });
        return { status: 200 as const, body: { result: nextResult, affectedCount } };
      }),
  };
}
