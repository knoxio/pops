/**
 * Core processing logic for a single transaction during import.
 *
 * Extracted from service.ts to keep functions small and auditable.
 */
import { formatImportError } from '../../../../lib/errors.js';
import { logger } from '../../../../lib/logger.js';
import { AiCategorizationError, categorizeWithAi } from './ai-categorizer.js';
import { applyLearnedCorrection } from './correction-application.js';
import { matchEntity } from './entity-matcher.js';
import { buildSuggestedTags } from './tag-management.js';

import type { ParsedTransaction, ProcessedTransaction } from '../types.js';
import type { EntityEntry } from './entity-lookup.js';
import type { AliasMap, EntityLookupMap } from './entity-matcher.js';

export interface AiCounters {
  aiError: AiCategorizationError | null;
  aiFailureCount: number;
  aiApiCalls: number;
  aiCacheHits: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface ProcessContext {
  entityLookup: EntityLookupMap;
  aliases: AliasMap;
  knownTags: string[];
  importBatchId: string;
}

export interface TransactionProcessResult {
  matched?: ProcessedTransaction;
  uncertain?: ProcessedTransaction;
  failed?: ProcessedTransaction;
  batchStatus: 'success' | 'failed';
  errorEntry?: { description: string; error: string };
}

export function createAiCounters(): AiCounters {
  return {
    aiError: null,
    aiFailureCount: 0,
    aiApiCalls: 0,
    aiCacheHits: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  };
}

function buildMatchedFromEntity(
  transaction: ParsedTransaction,
  entry: EntityEntry,
  matchType: 'alias' | 'exact' | 'prefix' | 'contains' | 'ai',
  category: string | null,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: {
      entityId: entry.id,
      entityName: entry.name,
      matchType,
    },
    status: 'matched',
    suggestedTags: buildSuggestedTags(transaction.description, entry.id, [], category, knownTags),
  };
}

function buildUncertainFromAi(
  transaction: ParsedTransaction,
  entityName: string,
  category: string | null,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: {
      entityName,
      matchType: 'ai',
      confidence: 0.7,
    },
    status: 'uncertain',
    suggestedTags: buildSuggestedTags(transaction.description, null, [], category, knownTags),
  };
}

function buildUncertainNoMatch(
  transaction: ParsedTransaction,
  reason: string,
  knownTags: string[]
): ProcessedTransaction {
  return {
    ...transaction,
    entity: { matchType: 'none' },
    status: 'uncertain',
    error: reason,
    suggestedTags: buildSuggestedTags(transaction.description, null, [], null, knownTags),
  };
}

function tryEntityMatch(
  transaction: ParsedTransaction,
  context: ProcessContext
): ProcessedTransaction | null {
  const match = matchEntity(transaction.description, context.entityLookup, context.aliases);
  if (!match) return null;

  const entityEntry = context.entityLookup.get(match.entityName.toLowerCase());
  if (!entityEntry) {
    throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
  }
  return buildMatchedFromEntity(transaction, entityEntry, match.matchType, null, context.knownTags);
}

async function tryAiCategorization(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters
): Promise<{ entityName: string | null; category: string | null } | null> {
  try {
    const { result, usage } = await categorizeWithAi(transaction.rawRow, context.importBatchId);

    if (usage) {
      counters.aiApiCalls++;
      counters.totalInputTokens += usage.inputTokens;
      counters.totalOutputTokens += usage.outputTokens;
      counters.totalCostUsd += usage.costUsd;
    } else {
      counters.aiCacheHits++;
    }

    if (!result?.entityName) return null;
    return { entityName: result.entityName, category: result.category ?? null };
  } catch (error) {
    if (error instanceof AiCategorizationError) {
      counters.aiError = error;
      counters.aiFailureCount++;
      return null;
    }
    throw error;
  }
}

function resolveAiResult(
  transaction: ParsedTransaction,
  aiEntityName: string,
  category: string | null,
  context: ProcessContext
): ProcessedTransaction {
  const entry = context.entityLookup.get(aiEntityName.toLowerCase());
  if (entry) {
    return buildMatchedFromEntity(transaction, entry, 'ai', category, context.knownTags);
  }
  return buildUncertainFromAi(transaction, aiEntityName, category, context.knownTags);
}

function buildFailure(
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

async function classifyTransaction(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters,
  index: number,
  total: number
): Promise<TransactionProcessResult> {
  const correctionApplied = applyLearnedCorrection({
    transaction,
    minConfidence: 0.7,
    knownTags: context.knownTags,
    index,
    total,
  });
  if (correctionApplied) {
    return {
      [correctionApplied.bucket]: correctionApplied.processed,
      batchStatus: 'success',
    } as TransactionProcessResult;
  }

  const entityMatched = tryEntityMatch(transaction, context);
  if (entityMatched) {
    logger.debug(
      {
        index,
        total,
        description: transaction.description.slice(0, 50),
        entityName: entityMatched.entity.entityName,
        matchType: entityMatched.entity.matchType,
      },
      '[Import] Entity matched'
    );
    return { matched: entityMatched, batchStatus: 'success' };
  }

  const aiResult = await tryAiCategorization(transaction, context, counters);
  if (aiResult?.entityName) {
    const processed = resolveAiResult(transaction, aiResult.entityName, aiResult.category, context);
    const bucket = processed.status === 'matched' ? 'matched' : 'uncertain';
    return { [bucket]: processed, batchStatus: 'success' } as TransactionProcessResult;
  }

  const reason = counters.aiError ? 'AI categorization unavailable' : 'No entity match found';
  return {
    uncertain: buildUncertainNoMatch(transaction, reason, context.knownTags),
    batchStatus: 'success',
  };
}

export async function processTransactionSafely(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters,
  index: number,
  total: number
): Promise<TransactionProcessResult> {
  try {
    return await classifyTransaction(transaction, context, counters, index, total);
  } catch (error) {
    const { failed, errorEntry } = buildFailure(transaction, error);
    return { failed, batchStatus: 'failed', errorEntry };
  }
}
