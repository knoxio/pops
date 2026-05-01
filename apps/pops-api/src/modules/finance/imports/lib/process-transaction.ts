/**
 * Core processing logic for a single transaction during import.
 */
import { logger } from '../../../../lib/logger.js';
import { AiCategorizationError, categorizeWithAi } from './ai-categorizer.js';
import { applyLearnedCorrection } from './correction-application.js';
import { matchEntity } from './entity-matcher.js';
import {
  buildFailure,
  buildMatchedFromEntity,
  buildMatchedTransfer,
  buildUncertainFromAi,
  buildUncertainNoMatch,
} from './process-transaction-helpers.js';
import { isTransferOrIncomeRow } from './transfer-classifier.js';

import type { ParsedTransaction, ProcessedTransaction } from '../types.js';
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
  return buildMatchedFromEntity({
    transaction,
    entry: entityEntry,
    matchType: match.matchType,
    category: null,
    knownTags: context.knownTags,
  });
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
    return buildMatchedFromEntity({
      transaction,
      entry,
      matchType: 'ai',
      category,
      knownTags: context.knownTags,
    });
  }
  return buildUncertainFromAi(transaction, aiEntityName, category, context.knownTags);
}

export interface ProcessTransactionArgs {
  transaction: ParsedTransaction;
  context: ProcessContext;
  counters: AiCounters;
  index: number;
  total: number;
}

async function classifyTransaction(
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  const { transaction, context, counters, index, total } = args;
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

  // Auto-classify inbound transfers / income before the entity-matcher and AI
  // cascade — these rows are not merchants and surfacing them in the
  // Review/uncertain bucket asks the user a question that has no good answer
  // (#2448).
  if (isTransferOrIncomeRow(transaction)) {
    logger.debug(
      {
        index,
        total,
        description: transaction.description.slice(0, 50),
        amount: transaction.amount,
      },
      '[Import] Auto-classified as transfer'
    );
    return {
      matched: buildMatchedTransfer(transaction, context.knownTags),
      batchStatus: 'success',
    };
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
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  try {
    return await classifyTransaction(args);
  } catch (error) {
    const { failed, errorEntry } = buildFailure(args.transaction, error);
    return { failed, batchStatus: 'failed', errorEntry };
  }
}
