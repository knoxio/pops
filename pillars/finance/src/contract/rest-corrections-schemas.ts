/**
 * Zod schemas for the `corrections.*` REST contract — split out of
 * `rest-corrections.ts` so the contract router stays under the line cap.
 *
 * The ChangeSet schemas also feed the in-pillar imports pipeline
 * (`api/modules/corrections`), so they are re-exported from `rest-corrections.ts`
 * to keep that import path stable.
 */
import { z } from 'zod';

import { LimitQuery, OffsetQuery } from './rest-schemas.js';

export const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);
export const TransactionTypeSchema = z.enum(['purchase', 'transfer', 'income']);

/** Body of a correction `add` op (create-shape + ChangeSet-only confidence/isActive). */
export const CreateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema.default('exact'),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  transactionType: TransactionTypeSchema.nullable().optional(),
  priority: z.number().int().nonnegative().optional(),
});

/** Body of a correction `edit` op (all fields optional patch). */
export const UpdateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1).optional(),
  matchType: MatchTypeSchema.optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: TransactionTypeSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  priority: z.number().int().nonnegative().optional(),
});

const CorrectionRuleDataSchema = CreateCorrectionSchema.extend({
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});

export const ChangeSetOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), data: CorrectionRuleDataSchema }),
  z.object({ op: z.literal('edit'), id: z.string().min(1), data: UpdateCorrectionSchema }),
  z.object({ op: z.literal('disable'), id: z.string().min(1) }),
  z.object({ op: z.literal('remove'), id: z.string().min(1) }),
]);

export const ChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(ChangeSetOpSchema).min(1),
});

export type ChangeSetOp = z.infer<typeof ChangeSetOpSchema>;
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

/**
 * Persisted correction row as served by the handlers (`toCorrection`): `tags`
 * is parsed to a `string[]` (the column stores JSON), `isActive` is a real
 * boolean. Mirrors the monolith `Correction` projection.
 */
export const CorrectionSchema = z.object({
  id: z.string(),
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  tags: z.array(z.string()),
  transactionType: TransactionTypeSchema.nullable(),
  isActive: z.boolean(),
  priority: z.number(),
  confidence: z.number(),
  timesApplied: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const CorrectionMutation = z.object({ data: CorrectionSchema, message: z.string() });

export const CorrectionListQuery = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  matchType: MatchTypeSchema.optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

export const FindMatchBody = z.object({
  description: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.7),
});

export const FindMatchResult = z.object({
  data: CorrectionSchema.nullable(),
  status: z.enum(['matched', 'uncertain']).nullable(),
});

export const PreviewMatchesBody = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  limit: z.number().int().positive().max(200).optional(),
});

/** A transaction row a candidate rule would match, with `tags` parsed to a `string[]`. */
const PreviewMatchTransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  account: z.string(),
  amount: z.number(),
  date: z.string(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export const PreviewMatchResultSchema = z.object({
  matches: z.array(PreviewMatchTransactionSchema),
  total: z.number(),
  scanned: z.number(),
  truncated: z.boolean(),
});

/** A pending (un-persisted) ChangeSet folded into the baseline before a preview / merged list. */
const PendingChangeSetSchema = z.object({ changeSet: ChangeSetSchema });

/** A caller-supplied transaction to diff in a ChangeSet preview (description + optional dedupe checksum). */
const PreviewChangeSetTransactionSchema = z.object({
  checksum: z.string().optional(),
  description: z.string().min(1),
});

export const PreviewChangeSetBody = z.object({
  changeSet: ChangeSetSchema,
  transactions: z.array(PreviewChangeSetTransactionSchema).min(1).max(2000),
  minConfidence: z.number().min(0).max(1).default(0.7),
  pendingChangeSets: z.array(PendingChangeSetSchema).max(200).optional(),
});

const CorrectionMatchSummarySchema = z.object({
  matched: z.boolean(),
  status: z.enum(['matched', 'uncertain']).nullable(),
  ruleId: z.string().nullable(),
  confidence: z.number().nullable(),
});

export const ChangeSetPreviewDiffSchema = z.object({
  checksum: z.string().optional(),
  description: z.string(),
  before: CorrectionMatchSummarySchema,
  after: CorrectionMatchSummarySchema,
  changed: z.boolean(),
});

export const ChangeSetPreviewSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  newMatches: z.number().int().nonnegative(),
  removedMatches: z.number().int().nonnegative(),
  statusChanges: z.number().int().nonnegative(),
  netMatchedDelta: z.number().int(),
});

export const ListMergedBody = z.object({
  pendingChangeSets: z.array(PendingChangeSetSchema).max(200).optional(),
  limit: z.number().int().positive().max(50000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
