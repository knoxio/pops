/**
 * AI-cluster handlers for the `corrections.*` sub-router — analyze /
 * generate-rules / propose / revise / reject. Thin wrappers over the
 * `api/modules/corrections` AI functions; the AI client + the cross-pillar
 * rejection-feedback store are injectable (see `ai-runtime.ts`) so tests run
 * offline. The finance pillar trusts the docker network, so the rejection
 * record is stamped with a service principal rather than a request user.
 */
import { type FinanceDb } from '../../db/index.js';
import {
  analyzeCorrection,
  generateRules,
  persistRejectedChangeSetFeedback,
  proposeChangeSetFromCorrectionSignal,
  reviseChangeSet,
} from '../modules/corrections/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeCorrectionsContract } from '../../contract/rest-corrections.js';

type Req = ServerInferRequest<typeof financeCorrectionsContract>;

const REJECTION_PRINCIPAL = 'finance-pillar';

export function makeCorrectionsAiHandlers(db: FinanceDb) {
  return {
    analyzeCorrection: ({ body }: Req['analyzeCorrection']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await analyzeCorrection(body) },
      })),

    generateRules: ({ body }: Req['generateRules']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { proposals: await generateRules(db, body.transactions) },
      })),

    proposeChangeSet: ({ body }: Req['proposeChangeSet']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await proposeChangeSetFromCorrectionSignal(db, {
          signal: body.signal,
          minConfidence: body.minConfidence,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    reviseChangeSet: ({ body }: Req['reviseChangeSet']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await reviseChangeSet(db, {
          signal: body.signal,
          currentChangeSet: body.currentChangeSet,
          instruction: body.instruction,
          triggeringTransactions: body.triggeringTransactions,
        }),
      })),

    rejectChangeSet: ({ body }: Req['rejectChangeSet']) =>
      runHttp(async () => {
        try {
          await persistRejectedChangeSetFeedback(db, {
            signal: body.signal,
            changeSet: body.changeSet,
            feedback: body.feedback,
            impactSummary: body.impactSummary ?? null,
            userEmail: REJECTION_PRINCIPAL,
          });
        } catch {
          // best-effort: rejection feedback persistence is non-critical to the reject.
        }
        return { status: 200 as const, body: { message: 'ChangeSet rejected' } };
      }),
  };
}
