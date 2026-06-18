/**
 * Handlers for the `corrections.*` sub-router — deterministic CRUD over the
 * finance-owned `transaction_corrections` table.
 *
 * Wraps `transactionCorrectionsService` (the finance-db data layer) in
 * `runHttp` so a `TransactionCorrectionNotFoundError` (missing id on get /
 * update / delete / adjustConfidence) maps to 404 via the shared `HttpError`
 * path. `findMatch` and `previewMatches` are read-only computations against
 * the corrections / transactions tables.
 *
 * The ChangeSet propose/preview/apply machinery and the AI procedures from the
 * monolith `core.corrections.*` router are intentionally NOT served here — see
 * `contract/rest-corrections.ts` for why.
 */
import { desc } from 'drizzle-orm';

import {
  type FinanceDb,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionRow,
  type TransactionRow,
  TransactionCorrectionNotFoundError,
  transactionCorrectionsService,
  transactions,
} from '../../db/index.js';
import { classifyCorrectionMatch, parseCorrectionTags } from '../modules/corrections/index.js';
import { NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeCorrectionsContract } from '../../contract/rest-corrections.js';

type Req = ServerInferRequest<typeof financeCorrectionsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const PREVIEW_DEFAULT_LIMIT = 25;
const PREVIEW_HARD_LIMIT = 200;

interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: TransactionCorrectionMatchType;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

function toCorrection(row: TransactionCorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseCorrectionTags(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    priority: row.priority,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * Verify a candidate `(pattern, matchType)` matches a description after
 * normalisation. Mirrors the monolith `patternMatchesDescription` so a preview
 * matches exactly what the rule would match at apply time (both pattern and
 * description are normalised for `exact`/`contains`; `regex` runs against the
 * normalised description with the raw pattern).
 */
function patternMatchesDescription(
  pattern: string,
  matchType: TransactionCorrectionMatchType,
  description: string
): boolean {
  const { normalizeDescription } = transactionCorrectionsService;
  const normalizedDescription = normalizeDescription(description);
  const normalizedPattern = matchType === 'regex' ? pattern : normalizeDescription(pattern);
  if (normalizedPattern.length === 0) return false;
  if (matchType === 'exact') return normalizedPattern === normalizedDescription;
  if (matchType === 'contains') return normalizedDescription.includes(normalizedPattern);
  try {
    return new RegExp(normalizedPattern).test(normalizedDescription);
  } catch {
    return false;
  }
}

function previewMatchTransaction(row: TransactionRow) {
  return {
    id: row.id,
    description: row.description,
    account: row.account,
    amount: row.amount,
    date: row.date,
    entityName: row.entityName,
    tags: parseCorrectionTags(row.tags ?? '[]'),
  };
}

function previewMatches(db: FinanceDb, input: Req['previewMatches']['body']) {
  const limit = Math.min(input.limit ?? PREVIEW_DEFAULT_LIMIT, PREVIEW_HARD_LIMIT);
  const rows = db.select().from(transactions).orderBy(desc(transactions.date)).all();

  const matched = rows.filter((row) =>
    patternMatchesDescription(input.descriptionPattern, input.matchType, row.description)
  );

  const truncated = matched.length > limit;
  const sliced = truncated ? matched.slice(0, limit) : matched;

  return {
    matches: sliced.map(previewMatchTransaction),
    total: matched.length,
    scanned: rows.length,
    truncated,
  };
}

function translateCorrectionError(err: unknown, id?: string): never {
  if (err instanceof TransactionCorrectionNotFoundError) {
    throw new NotFoundError('Correction', id ?? err.id);
  }
  throw err;
}

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
      runHttp(() => ({
        status: 200 as const,
        body: { data: previewMatches(db, body) },
      })),

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
  };
}
