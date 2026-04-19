import type { AiUsageStats, ImportWarning, ProcessedTransaction } from '../types.js';
/**
 * Helpers for processing imports — building the per-batch state, AI usage, warnings.
 */
import type { AiCounters } from './process-transaction.js';

export interface ProgressBatchItem {
  description: string;
  status: 'processing' | 'success' | 'failed';
  error?: string;
}

export function appendBatchItem(currentBatch: ProgressBatchItem[], item: ProgressBatchItem): void {
  currentBatch.push(item);
  if (currentBatch.length > 5) currentBatch.shift();
}

export function buildAiUsage(counters: AiCounters): AiUsageStats | undefined {
  const { aiApiCalls, aiCacheHits, totalInputTokens, totalOutputTokens, totalCostUsd } = counters;
  if (aiApiCalls === 0 && aiCacheHits === 0) return undefined;
  return {
    apiCalls: aiApiCalls,
    cacheHits: aiCacheHits,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    avgCostPerCall: aiApiCalls > 0 ? totalCostUsd / aiApiCalls : 0,
  };
}

export function buildAiWarnings(counters: AiCounters): ImportWarning[] {
  const { aiError, aiFailureCount } = counters;
  if (!aiError || aiFailureCount === 0) return [];
  return [
    {
      type:
        aiError.code === 'INSUFFICIENT_CREDITS' ? 'AI_CATEGORIZATION_UNAVAILABLE' : 'AI_API_ERROR',
      message: aiError.message,
      affectedCount: aiFailureCount,
    },
  ];
}

export interface ProcessBuckets {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
}

export function makeBuckets(): ProcessBuckets {
  return { matched: [], uncertain: [], failed: [], skipped: [] };
}
