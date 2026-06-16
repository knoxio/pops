/**
 * Handlers for the `tagRules.*` sub-router. The propose/preview paths are
 * pure deterministic computations over caller-supplied transactions; apply
 * mutates `transaction_tag_rules` (and upserts accepted vocabulary tags)
 * inside a single db transaction.
 *
 * `TransactionTagRuleNotFoundError` (an edit/disable/remove op on an unknown
 * id) maps to 404 via the shared `HttpError` path.
 */
import {
  type FinanceDb,
  tagVocabularyService,
  TransactionTagRuleNotFoundError,
} from '../../db/index.js';
import { previewTagRuleChangeSet } from '../modules/tag-rules/preview.js';
import { applyTagRuleChangeSet, proposeTagRuleChangeSet } from '../modules/tag-rules/service.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTagRulesContract } from '../../contract/rest-tag-rules.js';

type Req = ServerInferRequest<typeof financeTagRulesContract>;

export function makeTagRulesHandlers(db: FinanceDb) {
  return {
    vocabulary: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { tags: tagVocabularyService.listVocabularyTags(db) },
      })),

    propose: ({ body }: Req['propose']) =>
      runHttp(() => ({
        status: 200 as const,
        body: proposeTagRuleChangeSet(db, {
          signal: body.signal,
          transactions: body.transactions,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    preview: ({ body }: Req['preview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: previewTagRuleChangeSet(db, {
          changeSet: body.changeSet,
          transactions: body.transactions,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    apply: ({ body }: Req['apply']) =>
      runHttp(() => {
        try {
          for (const tag of body.acceptedNewTags) {
            if (tag.trim()) tagVocabularyService.upsertVocabularyTag(db, tag.trim(), 'user');
          }
          const rules = applyTagRuleChangeSet(db, body.changeSet);
          return { status: 200 as const, body: { rules } };
        } catch (err) {
          if (err instanceof TransactionTagRuleNotFoundError) {
            throw new NotFoundError('transaction_tag_rules', err.id);
          }
          throw err;
        }
      }),

    reject: ({ body }: Req['reject']) =>
      runHttp(() => {
        const followUpProposal = body.signal
          ? proposeTagRuleChangeSet(db, {
              signal: body.signal,
              transactions: body.transactions ?? [],
              maxPreviewItems: body.maxPreviewItems,
              rejectionFeedback: body.feedback,
            })
          : null;
        return {
          status: 200 as const,
          body: { message: 'Tag rule ChangeSet rejected', followUpProposal },
        };
      }),
  };
}
