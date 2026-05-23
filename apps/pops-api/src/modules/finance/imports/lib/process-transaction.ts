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
  type AiCategorizationResult,
  type AiCounters,
  type ProcessContext,
  type TransactionProcessResult,
} from './process-transaction-helpers.js';
import { isTransferOrIncomeRow } from './transfer-classifier.js';

export {
  createAiCounters,
  type AiCounters,
  type ProcessContext,
  type TransactionProcessResult,
} from './process-transaction-helpers.js';

import type { ParsedTransaction, ProcessedTransaction } from '../types.js';

function tryEntityMatch(
  transaction: ParsedTransaction,
  context: ProcessContext
): ProcessedTransaction | null {
  const match = matchEntity(transaction.description, context.entityLookup, context.aliases);
  if (!match) return null;
  const entityEntry = context.entityLookup.get(match.entityName.toLowerCase());
  if (!entityEntry) throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
  return buildMatchedFromEntity({
    transaction,
    entry: entityEntry,
    matchType: match.matchType,
    knownTags: context.knownTags,
  });
}

async function tryAiCategorization(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters
): Promise<AiCategorizationResult | null> {
  try {
    const { result, usage } = await categorizeWithAi(
      transaction.rawRow,
      context.importBatchId,
      context.knownTags
    );
    if (usage) {
      counters.aiApiCalls++;
      counters.totalInputTokens += usage.inputTokens;
      counters.totalOutputTokens += usage.outputTokens;
      counters.totalCostUsd += usage.costUsd;
    } else {
      counters.aiCacheHits++;
    }
    if (!result?.entityName) return null;
    return {
      entityName: result.entityName,
      aiTags: result.tags ?? [],
      aiCategory: result.tags?.length ? null : (result.category ?? null),
    };
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
  ai: AiCategorizationResult,
  context: ProcessContext
): ProcessedTransaction {
  const entry = context.entityLookup.get(ai.entityName.toLowerCase());
  if (entry) {
    return buildMatchedFromEntity({
      transaction,
      entry,
      matchType: 'ai',
      aiTags: ai.aiTags,
      category: ai.aiCategory,
      knownTags: context.knownTags,
    });
  }
  return buildUncertainFromAi({
    transaction,
    entityName: ai.entityName,
    aiTags: ai.aiTags,
    aiCategory: ai.aiCategory,
    knownTags: context.knownTags,
  });
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
    const processed = resolveAiResult(transaction, aiResult, context);
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
