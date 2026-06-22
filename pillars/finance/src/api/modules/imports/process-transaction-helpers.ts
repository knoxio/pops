/**
 * ProcessedTransaction builders for each classification outcome.
 *
 * Ported from the monolith `lib/process-transaction-helpers.ts`, db-injected:
 * every builder takes a `FinanceDb` handle so it can resolve suggested tags
 * through the pillar's tag-suggester.
 */
import { type FinanceDb } from '../../../db/index.js';
import { formatImportError } from './format-error.js';
import { buildSuggestedTags } from './tag-management.js';

import type { EntityLookupEntry } from '../../../db/index.js';
import type { ErrorEntry, ParsedTransaction, ProcessedTransaction } from './types.js';

export interface AiCategorizationResult {
  entityName: string;
  aiTags: string[];
  aiCategory: string | null;
}

export interface MatchedFromEntityArgs {
  transaction: ParsedTransaction;
  entry: EntityLookupEntry;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains' | 'ai';
  aiTags?: string[];
  category?: string | null;
  knownTags: string[];
  entityDefaultTags: ReadonlyMap<string, string[]>;
}

export function buildMatchedFromEntity(
  db: FinanceDb,
  args: MatchedFromEntityArgs
): ProcessedTransaction {
  return {
    ...args.transaction,
    entity: { entityId: args.entry.id, entityName: args.entry.name, matchType: args.matchType },
    status: 'matched',
    suggestedTags: buildSuggestedTags(db, {
      description: args.transaction.description,
      entityId: args.entry.id,
      correctionTags: [],
      aiTags: args.aiTags,
      aiCategory: args.category ?? null,
      knownTags: args.knownTags,
      entityDefaultTags: args.entityDefaultTags,
    }),
  };
}

/** Build a `matched` transfer row — no entity (transfers are inter-account moves). */
export function buildMatchedTransfer(
  db: FinanceDb,
  transaction: ParsedTransaction,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'matched',
    transactionType: 'transfer',
    suggestedTags: buildSuggestedTags(db, {
      description: transaction.description,
      entityId: null,
      correctionTags: [],
      aiCategory: null,
      knownTags,
    }),
  };
}

export interface UncertainFromAiArgs {
  transaction: ParsedTransaction;
  entityName: string;
  aiTags: string[];
  aiCategory: string | null;
  knownTags: string[];
}

export function buildUncertainFromAi(
  db: FinanceDb,
  args: UncertainFromAiArgs
): ProcessedTransaction {
  return {
    ...args.transaction,
    entity: { entityName: args.entityName, matchType: 'ai', confidence: 0.7 },
    status: 'uncertain',
    suggestedTags: buildSuggestedTags(db, {
      description: args.transaction.description,
      entityId: null,
      correctionTags: [],
      aiTags: args.aiTags,
      aiCategory: args.aiCategory,
      knownTags: args.knownTags,
    }),
  };
}

export function buildUncertainNoMatch(
  db: FinanceDb,
  transaction: ParsedTransaction,
  reason: string,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'uncertain',
    error: reason,
    suggestedTags: buildSuggestedTags(db, {
      description: transaction.description,
      entityId: null,
      correctionTags: [],
      aiCategory: null,
      knownTags,
    }),
  };
}

export function buildFailure(
  transaction: ParsedTransaction,
  error: unknown
): { failed: ProcessedTransaction; message: string; errorEntry: ErrorEntry } {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const failed: ProcessedTransaction = {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'failed',
    error: message,
  };
  const formatted = formatImportError(error, { transaction: transaction.description });
  return {
    failed,
    message,
    errorEntry: {
      description: transaction.description.slice(0, 50),
      error: formatted.message + (formatted.suggestion ? ` - ${formatted.suggestion}` : ''),
    },
  };
}
