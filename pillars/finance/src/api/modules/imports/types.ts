/**
 * Internal TS shapes for the imports domain logic.
 *
 * The wire schemas + their inferred types live in the contract
 * (`contract/rest-imports-schemas.ts`); this file re-exports those inferred
 * types for the pipeline plus the internal-only coordination types that never
 * cross the wire (progress batch items, AI counters, the per-batch context).
 */
import type { EntityMaps } from '../../../db/index.js';

export type {
  AiUsageStats,
  CommitPayload,
  CommitResult,
  ConfirmedTransaction,
  CreateEntityOutput,
  EntityMatch,
  ExecuteImportOutput,
  FailedTransactionDetail,
  ImportResult,
  ImportWarning,
  MatchedRule,
  ParsedTransaction,
  ProcessedTransaction,
  ProcessImportOutput,
  RuleProvenance,
  SuggestedTag,
  TransactionType,
} from '../../../contract/rest-imports-schemas.js';

export interface ProgressBatchItem {
  description: string;
  status: 'processing' | 'success' | 'failed';
  error?: string;
}

export interface ErrorEntry {
  description: string;
  error: string;
}

export interface AiCounters {
  /** True once any AI call has failed in this batch (gates the no-match reason). */
  aiError: boolean;
  aiFailureCount: number;
  aiApiCalls: number;
  aiCacheHits: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface ProcessContext {
  entityLookup: EntityMaps['entityLookup'];
  aliases: EntityMaps['aliasMap'];
  knownTags: string[];
  importBatchId: string;
  /** `contactId → defaultTags` from the per-run contacts fetch (entity tag source). */
  entityDefaultTags: ReadonlyMap<string, string[]>;
}

export function createAiCounters(): AiCounters {
  return {
    aiError: false,
    aiFailureCount: 0,
    aiApiCalls: 0,
    aiCacheHits: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  };
}
