/**
 * Projection + read helpers shared by the corrections handlers.
 *
 * Split out of `corrections-handlers.ts` so the handler factory stays under the
 * line cap. Pure-ish data shaping over the finance-owned `transaction_corrections`
 * / `transactions` tables — no HTTP concerns beyond translating the package's
 * `TransactionCorrectionNotFoundError` to the in-tree `NotFoundError` (→ 404).
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
import {
  applyChangeSetToRules,
  parseCorrectionTags,
  type CorrectionRow,
} from '../modules/corrections/index.js';
import { NotFoundError } from '../shared/errors.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { ChangeSet } from '../../contract/rest-corrections.js';
import type { financeCorrectionsContract } from '../../contract/rest-corrections.js';

type Req = ServerInferRequest<typeof financeCorrectionsContract>;

export const DEFAULT_LIMIT = 50;
export const DEFAULT_OFFSET = 0;
const PREVIEW_DEFAULT_LIMIT = 25;
const PREVIEW_HARD_LIMIT = 200;
const ALL_RULES_LIMIT = 50_000;

export interface Correction {
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

export function toCorrection(row: TransactionCorrectionRow): Correction {
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

export interface PreviewMatchTransactionView {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  entityName: string | null;
  tags: string[];
}

export interface PreviewMatchesResult {
  matches: PreviewMatchTransactionView[];
  total: number;
  scanned: number;
  truncated: boolean;
}

function previewMatchTransaction(row: TransactionRow): PreviewMatchTransactionView {
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

export function previewMatches(
  db: FinanceDb,
  input: Req['previewMatches']['body']
): PreviewMatchesResult {
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

/**
 * All persisted rules with any pending (un-persisted) ChangeSets folded in,
 * in the service's stable order with `temp:` adds appended. Shared by
 * `listMerged` and the `previewChangeSet` baseline so both see the same
 * pending state. A pending op targeting an unknown id throws `NotFoundError`
 * (→ 404 via `runHttp`).
 */
export function mergedRules(
  db: FinanceDb,
  pendingChangeSets?: { changeSet: ChangeSet }[]
): CorrectionRow[] {
  const { rows } = transactionCorrectionsService.listTransactionCorrections(db, {
    limit: ALL_RULES_LIMIT,
    offset: 0,
  });
  if (!pendingChangeSets || pendingChangeSets.length === 0) return rows;
  return pendingChangeSets.reduce<CorrectionRow[]>(
    (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
    rows
  );
}

export function translateCorrectionError(err: unknown, id?: string): never {
  if (err instanceof TransactionCorrectionNotFoundError) {
    throw new NotFoundError('Correction', id ?? err.id);
  }
  throw err;
}
