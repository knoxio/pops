/**
 * Zod schemas + inferred types for the `imports.*` sub-router.
 *
 * Split from `rest-imports.ts` so the route map there stays under the per-file
 * line cap. These are the single source of truth for the import wire shapes;
 * the CSV/PDF transformers are out of scope (the wire receives already-parsed
 * transactions via {@link ParsedTransactionSchema}).
 */
import { z } from 'zod';

import { ENTITY_TYPES } from '../db/index.js';
import { ChangeSetSchema } from './rest-corrections.js';
import { TagRuleChangeSetSchema } from './rest-tag-rules.js';

/** Transaction as parsed upstream (client-side or a transformer), with audit + dedup fields. */
export const ParsedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z.string().min(1),
  amount: z.number(),
  account: z.string().min(1),
  location: z.string().optional(),
  rawRow: z.string(),
  checksum: z.string(),
});

export const EntityMatchSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  matchType: z.enum(['alias', 'exact', 'prefix', 'contains', 'ai', 'learned', 'manual', 'none']),
  confidence: z.number().min(0).max(1).optional(),
});

export const TransactionTypeSchema = z.enum(['purchase', 'transfer', 'income']);

export const SuggestedTagSchema = z.object({
  tag: z.string(),
  source: z.enum(['ai', 'rule', 'entity']),
  pattern: z.string().optional(),
  isNew: z.boolean().optional(),
});

export const RuleProvenanceSchema = z.object({
  source: z.literal('correction'),
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  confidence: z.number().min(0).max(1),
});

export const MatchedRuleSchema = z.object({
  ruleId: z.string().min(1),
  pattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  confidence: z.number().min(0).max(1),
  priority: z.number(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
});

export const ProcessedTransactionSchema = ParsedTransactionSchema.extend({
  entity: EntityMatchSchema,
  status: z.enum(['matched', 'uncertain', 'failed', 'skipped']),
  skipReason: z.string().optional(),
  error: z.string().optional(),
  transactionType: TransactionTypeSchema.optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
  ruleProvenance: RuleProvenanceSchema.optional(),
  matchedRules: z.array(MatchedRuleSchema).optional(),
});

export const ConfirmedTransactionSchema = ParsedTransactionSchema.extend({
  transactionType: TransactionTypeSchema.optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  suggestedTags: z.array(SuggestedTagSchema).optional(),
});

export const ImportWarningSchema = z.object({
  type: z.enum(['AI_CATEGORIZATION_UNAVAILABLE', 'AI_API_ERROR']),
  message: z.string(),
  affectedCount: z.number().optional(),
  details: z.string().optional(),
});

export const AiUsageStatsSchema = z.object({
  apiCalls: z.number(),
  cacheHits: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  avgCostPerCall: z.number(),
});

export const ProcessImportOutputSchema = z.object({
  matched: z.array(ProcessedTransactionSchema),
  uncertain: z.array(ProcessedTransactionSchema),
  failed: z.array(ProcessedTransactionSchema),
  skipped: z.array(ProcessedTransactionSchema),
  warnings: z.array(ImportWarningSchema).optional(),
  aiUsage: AiUsageStatsSchema.optional(),
});

export const ImportResultSchema = z.object({
  transaction: ConfirmedTransactionSchema,
  success: z.boolean(),
  error: z.string().optional(),
  pageId: z.string().optional(),
});

export const ExecuteImportOutputSchema = z.object({
  imported: z.number(),
  failed: z.array(ImportResultSchema),
  skipped: z.number(),
});

export const ProcessImportInputSchema = z.object({
  transactions: z.array(ParsedTransactionSchema),
  account: z.string().min(1),
});

export const ExecuteImportInputSchema = z.object({
  transactions: z.array(ConfirmedTransactionSchema),
});

export const CreateEntityInputSchema = z.object({ name: z.string().min(1).max(200) });
export const CreateEntityOutputSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
});

export const ApplyChangeSetAndReevaluateInputSchema = z.object({
  sessionId: z.string().uuid(),
  changeSet: ChangeSetSchema,
  minConfidence: z.number().min(0).max(1).default(0.7),
});

export const ApplyChangeSetAndReevaluateOutputSchema = z.object({
  result: ProcessImportOutputSchema,
  affectedCount: z.number().int().nonnegative(),
});

export const PendingEntitySchema = z.object({
  tempId: z.string().regex(/^temp:entity:[0-9a-f-]{36}$/, 'Temp ID must match temp:entity:{uuid}'),
  name: z.string().min(1),
  type: z.enum(ENTITY_TYPES).default('company'),
});

export const CommitPayloadSchema = z.object({
  entities: z.array(PendingEntitySchema).default([]),
  changeSets: z.array(ChangeSetSchema).default([]),
  tagRuleChangeSets: z.array(TagRuleChangeSetSchema).default([]),
  transactions: z.array(ConfirmedTransactionSchema),
});

export const RulesAppliedSchema = z.object({
  add: z.number().int().nonnegative(),
  edit: z.number().int().nonnegative(),
  disable: z.number().int().nonnegative(),
  remove: z.number().int().nonnegative(),
});

export const FailedTransactionDetailSchema = z.object({
  checksum: z.string().nullable(),
  error: z.string(),
});

export const CommitResultSchema = z.object({
  entitiesCreated: z.number().int().nonnegative(),
  rulesApplied: RulesAppliedSchema,
  tagRulesApplied: z.number().int().nonnegative(),
  transactionsImported: z.number().int().nonnegative(),
  transactionsFailed: z.number().int().nonnegative(),
  failedDetails: z.array(FailedTransactionDetailSchema),
  retroactiveReclassifications: z.number().int().nonnegative(),
});

export const ReevaluateWithPendingRulesInputSchema = z.object({
  sessionId: z.string().uuid(),
  minConfidence: z.number().min(0).max(1).default(0.7),
  pendingChangeSets: z.array(z.object({ changeSet: ChangeSetSchema })),
});

export const SessionIdSchema = z.object({ sessionId: z.string() });

const ProgressBatchItemSchema = z.object({
  description: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
  error: z.string().optional(),
});

export const ImportProgressSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['processing', 'completed', 'failed']),
  currentStep: z.enum(['deduplicating', 'matching', 'writing']),
  totalTransactions: z.number(),
  processedCount: z.number(),
  currentBatch: z.array(ProgressBatchItemSchema),
  errors: z.array(z.object({ description: z.string(), error: z.string() })),
  startedAt: z.string(),
  result: z.union([ProcessImportOutputSchema, ExecuteImportOutputSchema]).optional(),
});

export type ParsedTransaction = z.infer<typeof ParsedTransactionSchema>;
export type EntityMatch = z.infer<typeof EntityMatchSchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type SuggestedTag = z.infer<typeof SuggestedTagSchema>;
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;
export type MatchedRule = z.infer<typeof MatchedRuleSchema>;
export type ProcessedTransaction = z.infer<typeof ProcessedTransactionSchema>;
export type ConfirmedTransaction = z.infer<typeof ConfirmedTransactionSchema>;
export type ImportWarning = z.infer<typeof ImportWarningSchema>;
export type AiUsageStats = z.infer<typeof AiUsageStatsSchema>;
export type ProcessImportOutput = z.infer<typeof ProcessImportOutputSchema>;
export type ImportResult = z.infer<typeof ImportResultSchema>;
export type ExecuteImportOutput = z.infer<typeof ExecuteImportOutputSchema>;
export type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;
export type PendingEntity = z.infer<typeof PendingEntitySchema>;
export type CommitPayload = z.infer<typeof CommitPayloadSchema>;
export type CommitResult = z.infer<typeof CommitResultSchema>;
export type FailedTransactionDetail = z.infer<typeof FailedTransactionDetailSchema>;
