/**
 * Handlers for the `transactions.*` sub-router. Maps db domain errors
 * (`TransactionNotFoundError`, `TransactionAlreadyExistsError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409.
 *
 * `delete` returns the full row as a `snapshot` so the client can Undo via
 * `restore`, which re-inserts preserving id + dedup metadata.
 */
import {
  type FinanceDb,
  TransactionAlreadyExistsError,
  TransactionNotFoundError,
  transactionsService,
} from '../../db/index.js';
import { suggestTags as computeSuggestedTags } from '../modules/tag-suggester/index.js';
import { toTransaction } from '../modules/transactions-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const PREVIEW_DESCRIPTIONS_LIMIT = 2000;

function translateTransactionError(err: unknown, id?: string): never {
  if (err instanceof TransactionNotFoundError) throw new NotFoundError('Transaction', id ?? err.id);
  if (err instanceof TransactionAlreadyExistsError) throw new ConflictError(err.message);
  throw err;
}

export function makeTransactionsHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        const { rows, total } = transactionsService.listTransactions(
          db,
          {
            search: query.search,
            account: query.account,
            startDate: query.startDate,
            endDate: query.endDate,
            tag: query.tag,
            entityId: query.entityId,
            type: query.type,
          },
          limit,
          offset
        );

        return {
          status: 200 as const,
          body: { data: rows.map(toTransaction), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    suggestTags: ({ query }: Req['suggestTags']) =>
      runHttp(() => {
        const suggested = computeSuggestedTags(db, {
          description: query.description,
          entityId: query.entityId ?? null,
        });
        return { status: 200 as const, body: { tags: suggested.map((s) => s.tag) } };
      }),

    descriptionsForPreview: ({ query }: Req['descriptionsForPreview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: transactionsService.listDescriptionsForPreview(
          db,
          query.limit ?? PREVIEW_DESCRIPTIONS_LIMIT
        ),
      })),

    availableTags: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { tags: transactionsService.collectAvailableTags(db) },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = transactionsService.getTransaction(db, params.id);
          return { status: 200 as const, body: { data: toTransaction(row) } };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = transactionsService.createTransaction(db, body);
          return {
            status: 201 as const,
            body: { data: toTransaction(row), message: 'Transaction created' },
          };
        } catch (err) {
          translateTransactionError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = transactionsService.updateTransaction(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toTransaction(row), message: 'Transaction updated' },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          const snapshot = transactionsService.deleteTransaction(db, params.id);
          return { status: 200 as const, body: { message: 'Transaction deleted', snapshot } };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    restore: ({ body }: Req['restore']) =>
      runHttp(() => {
        try {
          const row = transactionsService.restoreTransaction(db, body);
          return {
            status: 201 as const,
            body: { data: toTransaction(row), message: 'Transaction restored' },
          };
        } catch (err) {
          translateTransactionError(err, body.id);
        }
      }),
  };
}
