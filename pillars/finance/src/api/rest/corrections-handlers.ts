/**
 * Handlers for the `corrections.*` sub-router — deterministic CRUD plus the
 * ChangeSet preview/apply/merged-list surface over the finance-owned
 * `transaction_corrections` table.
 *
 * Read/projection helpers live in `corrections-handlers-support.ts`; the AI
 * propose/revise/reject + rule-generator procedures from the monolith
 * `core.corrections.*` router are intentionally NOT served here yet — see
 * `contract/rest-corrections.ts`.
 */
import { type FinanceDb, transactionCorrectionsService } from '../../db/index.js';
import {
  applyChangeSet as applyCorrectionChangeSet,
  classifyCorrectionMatch,
  previewChangeSetImpact,
} from '../modules/corrections/index.js';
import { paginationMeta } from '../shared/pagination.js';
import { makeCorrectionsAiHandlers } from './corrections-ai-handlers.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  mergedRules,
  previewMatches,
  toCorrection,
  translateCorrectionError,
} from './corrections-handlers-support.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeCorrectionsContract } from '../../contract/rest-corrections.js';

type Req = ServerInferRequest<typeof financeCorrectionsContract>;

export function makeCorrectionsHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = transactionCorrectionsService.listTransactionCorrections(db, {
          minConfidence: query.minConfidence,
          matchType: query.matchType,
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: { data: rows.map(toCorrection), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = transactionCorrectionsService.getTransactionCorrection(db, params.id);
          return { status: 200 as const, body: { data: toCorrection(row) } };
        } catch (err) {
          translateCorrectionError(err, params.id);
        }
      }),

    findMatch: ({ body }: Req['findMatch']) =>
      runHttp(() => {
        const matches = transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb(
          db,
          body.description,
          body.minConfidence
        );
        const first = matches[0];
        if (!first) return { status: 200 as const, body: { data: null, status: null } };
        const { correction, status } = classifyCorrectionMatch(first);
        return { status: 200 as const, body: { data: toCorrection(correction), status } };
      }),

    previewMatches: ({ body }: Req['previewMatches']) =>
      runHttp(() => ({ status: 200 as const, body: { data: previewMatches(db, body) } })),

    createOrUpdate: ({ body }: Req['createOrUpdate']) =>
      runHttp(() => {
        const row = transactionCorrectionsService.createOrUpdateTransactionCorrection(db, body);
        return {
          status: 200 as const,
          body: { data: toCorrection(row), message: 'Correction saved' },
        };
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = transactionCorrectionsService.updateTransactionCorrection(
            db,
            params.id,
            body
          );
          return {
            status: 200 as const,
            body: { data: toCorrection(row), message: 'Correction updated' },
          };
        } catch (err) {
          translateCorrectionError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          transactionCorrectionsService.deleteTransactionCorrection(db, params.id);
          return { status: 200 as const, body: { message: 'Correction deleted' } };
        } catch (err) {
          translateCorrectionError(err, params.id);
        }
      }),

    adjustConfidence: ({ params, body }: Req['adjustConfidence']) =>
      runHttp(() => {
        try {
          transactionCorrectionsService.adjustTransactionCorrectionConfidence(
            db,
            params.id,
            body.delta
          );
          return { status: 200 as const, body: { message: 'Confidence adjusted' } };
        } catch (err) {
          translateCorrectionError(err, params.id);
        }
      }),

    listMerged: ({ body }: Req['listMerged']) =>
      runHttp(() => {
        const limit = body.limit ?? DEFAULT_LIMIT;
        const offset = body.offset ?? DEFAULT_OFFSET;
        const merged = mergedRules(db, body.pendingChangeSets);
        const page = merged.slice(offset, offset + limit);
        return {
          status: 200 as const,
          body: {
            data: page.map(toCorrection),
            pagination: paginationMeta(merged.length, limit, offset),
          },
        };
      }),

    previewChangeSet: ({ body }: Req['previewChangeSet']) =>
      runHttp(() => ({
        status: 200 as const,
        body: previewChangeSetImpact({
          rules: mergedRules(db, body.pendingChangeSets),
          changeSet: body.changeSet,
          transactions: body.transactions,
          minConfidence: body.minConfidence,
        }),
      })),

    applyChangeSet: ({ body }: Req['applyChangeSet']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: applyCorrectionChangeSet(db, body.changeSet).map(toCorrection),
          message: 'ChangeSet applied',
        },
      })),

    ...makeCorrectionsAiHandlers(db),
  };
}
