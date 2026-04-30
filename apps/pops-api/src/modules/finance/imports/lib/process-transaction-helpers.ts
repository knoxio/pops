import { formatImportError } from '../../../../lib/errors.js';
import { buildSuggestedTags } from './tag-management.js';

import type { ParsedTransaction, ProcessedTransaction } from '../types.js';
import type { EntityEntry } from './entity-lookup.js';

export interface MatchedFromEntityArgs {
  transaction: ParsedTransaction;
  entry: EntityEntry;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains' | 'ai';
  category: string | null;
  knownTags: string[];
}

export function buildMatchedFromEntity(args: MatchedFromEntityArgs): ProcessedTransaction {
  return {
    ...args.transaction,
    entity: {
      entityId: args.entry.id,
      entityName: args.entry.name,
      matchType: args.matchType,
    },
    status: 'matched',
    suggestedTags: buildSuggestedTags({
      description: args.transaction.description,
      entityId: args.entry.id,
      correctionTags: [],
      aiCategory: args.category,
      knownTags: args.knownTags,
    }),
  };
}

/**
 * Build a `matched` ProcessedTransaction for a row auto-classified as a
 * transfer (#2448). No entity is assigned — transfers are inter-account
 * movements, not merchant purchases. The Review UI surfaces them in their
 * own bucket via `transactionType: 'transfer'`.
 */
export function buildMatchedTransfer(
  transaction: ParsedTransaction,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'matched',
    transactionType: 'transfer',
    suggestedTags: buildSuggestedTags({
      description: transaction.description,
      entityId: null,
      correctionTags: [],
      aiCategory: null,
      knownTags,
    }),
  };
}

export function buildUncertainFromAi(
  transaction: ParsedTransaction,
  entityName: string,
  category: string | null,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { entityName, matchType: 'ai', confidence: 0.7 },
    status: 'uncertain',
    suggestedTags: buildSuggestedTags({
      description: transaction.description,
      entityId: null,
      correctionTags: [],
      aiCategory: category,
      knownTags,
    }),
  };
}

export function buildUncertainNoMatch(
  transaction: ParsedTransaction,
  reason: string,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'uncertain',
    error: reason,
    suggestedTags: buildSuggestedTags({
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
): {
  failed: ProcessedTransaction;
  message: string;
  errorEntry: { description: string; error: string };
} {
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
