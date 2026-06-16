/**
 * Per-batch state helpers — bucket scaffolding, AI usage rollup, warnings.
 *
 * Ported from the monolith `lib/processing-helpers.ts`. The AI warning shape is
 * preserved on the wire (`ImportWarning`); with the categorizer stubbed off the
 * counters stay zero so no warnings are emitted in F1.
 */
import type { AiCounters, AiUsageStats, ImportWarning, ProcessedTransaction } from './types.js';

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
  if (!counters.aiError || counters.aiFailureCount === 0) return [];
  return [
    {
      type: 'AI_API_ERROR',
      message: 'AI categorization unavailable',
      affectedCount: counters.aiFailureCount,
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
