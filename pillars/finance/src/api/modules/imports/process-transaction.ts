/**
 * Single-transaction classification: correction rules → transfer heuristic →
 * entity matcher → AI fallback (stubbed in F1) → no-match.
 *
 * Ported from the monolith `lib/process-transaction.ts`, db-injected. The AI
 * stage calls the `ai-stub` categorizer, which returns `{ result: null }` while
 * the categorizer is disabled — so with AI off the no-match reason is always
 * `'No entity match found'` and the AI counters stay zero.
 */
import { type FinanceDb } from '../../../db/index.js';
import { categorizeWithAi } from './ai-stub.js';
import { applyLearnedCorrection } from './apply-learned-correction.js';
import { matchEntity } from './entity-matcher.js';
import {
  type AiCategorizationResult,
  buildFailure,
  buildMatchedFromEntity,
  buildMatchedTransfer,
  buildUncertainFromAi,
  buildUncertainNoMatch,
} from './process-transaction-helpers.js';
import { isTransferOrIncomeRow } from './transfer-classifier.js';

import type {
  AiCounters,
  ParsedTransaction,
  ProcessContext,
  ProcessedTransaction,
} from './types.js';

export interface TransactionProcessResult {
  matched?: ProcessedTransaction;
  uncertain?: ProcessedTransaction;
  failed?: ProcessedTransaction;
  batchStatus: 'success' | 'failed';
  errorEntry?: { description: string; error: string };
}

export interface ProcessTransactionArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  context: ProcessContext;
  counters: AiCounters;
}

function tryEntityMatch(
  db: FinanceDb,
  transaction: ParsedTransaction,
  context: ProcessContext
): ProcessedTransaction | null {
  const match = matchEntity(transaction.description, context.entityLookup, context.aliases);
  if (!match) return null;
  const entry = context.entityLookup.get(match.entityName.toLowerCase());
  if (!entry) throw new Error(`Entity lookup failed for matched entity: ${match.entityName}`);
  return buildMatchedFromEntity(db, {
    transaction,
    entry,
    matchType: match.matchType,
    knownTags: context.knownTags,
  });
}

async function tryAiCategorization(
  transaction: ParsedTransaction,
  context: ProcessContext,
  counters: AiCounters
): Promise<AiCategorizationResult | null> {
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
  } else if (result) {
    counters.aiCacheHits++;
  }
  if (!result?.entityName) return null;
  return {
    entityName: result.entityName,
    aiTags: result.tags ?? [],
    aiCategory: result.tags?.length ? null : (result.category ?? null),
  };
}

function resolveAiResult(
  db: FinanceDb,
  transaction: ParsedTransaction,
  ai: AiCategorizationResult,
  context: ProcessContext
): ProcessedTransaction {
  const entry = context.entityLookup.get(ai.entityName.toLowerCase());
  if (entry) {
    return buildMatchedFromEntity(db, {
      transaction,
      entry,
      matchType: 'ai',
      aiTags: ai.aiTags,
      category: ai.aiCategory,
      knownTags: context.knownTags,
    });
  }
  return buildUncertainFromAi(db, {
    transaction,
    entityName: ai.entityName,
    aiTags: ai.aiTags,
    aiCategory: ai.aiCategory,
    knownTags: context.knownTags,
  });
}

async function classifyTransaction(
  args: ProcessTransactionArgs
): Promise<TransactionProcessResult> {
  const { db, transaction, context, counters } = args;

  const correctionApplied = applyLearnedCorrection(db, {
    transaction,
    minConfidence: 0.7,
    knownTags: context.knownTags,
  });
  if (correctionApplied) {
    return {
      [correctionApplied.bucket]: correctionApplied.processed,
      batchStatus: 'success',
    } as TransactionProcessResult;
  }

  if (isTransferOrIncomeRow(transaction)) {
    return {
      matched: buildMatchedTransfer(db, transaction, context.knownTags),
      batchStatus: 'success',
    };
  }

  const entityMatched = tryEntityMatch(db, transaction, context);
  if (entityMatched) return { matched: entityMatched, batchStatus: 'success' };

  const aiResult = await tryAiCategorization(transaction, context, counters);
  if (aiResult?.entityName) {
    const processed = resolveAiResult(db, transaction, aiResult, context);
    const bucket = processed.status === 'matched' ? 'matched' : 'uncertain';
    return { [bucket]: processed, batchStatus: 'success' } as TransactionProcessResult;
  }

  const reason = counters.aiError ? 'AI categorization unavailable' : 'No entity match found';
  return {
    uncertain: buildUncertainNoMatch(db, transaction, reason, context.knownTags),
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
