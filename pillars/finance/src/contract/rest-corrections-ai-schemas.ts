/**
 * Zod schemas for the `corrections.*` AI cluster (C1-b): analyze / generate-rules
 * / propose / revise / reject. Split out of `rest-corrections-schemas.ts` to keep
 * both files under the line cap; the base schemas they build on
 * (`ChangeSetSchema`, `CorrectionSchema`, …) are imported from there.
 */
import { z } from 'zod';

import {
  ChangeSetPreviewSummarySchema,
  ChangeSetSchema,
  CorrectionSchema,
  MatchTypeSchema,
  TransactionTypeSchema,
} from './rest-corrections-schemas.js';

/** A user's intended correction rule — the trigger for an AI proposal. */
export const CorrectionSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: TransactionTypeSchema.nullable().optional(),
});

export const AnalyzeCorrectionBody = z.object({
  description: z.string().min(1),
  entityName: z.string(),
  amount: z.number(),
});

export const CorrectionAnalysisSchema = z.object({
  matchType: MatchTypeSchema,
  pattern: z.string(),
  confidence: z.number(),
});

export const GenerateRulesBody = z.object({
  transactions: z
    .array(
      z.object({
        description: z.string(),
        entityName: z.string().nullable(),
        amount: z.number(),
        account: z.string(),
        currentTags: z.array(z.string()).optional().default([]),
      })
    )
    .min(1)
    .max(50),
});

export const ProposedRuleSchema = z.object({
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  tags: z.array(z.string()),
  reasoning: z.string(),
});

export const ProposeChangeSetBody = z.object({
  signal: CorrectionSignalSchema,
  minConfidence: z.number().min(0).max(1).default(0.7),
  maxPreviewItems: z.number().int().positive().max(500).default(200),
});

const ClassificationOutcomeSchema = z.object({
  ruleId: z.string().nullable(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  tags: z.array(z.string()),
  transactionType: TransactionTypeSchema.nullable(),
});

const ImpactCountsSchema = z.object({
  affected: z.number().int().nonnegative(),
  entityChanges: z.number().int().nonnegative(),
  locationChanges: z.number().int().nonnegative(),
  tagChanges: z.number().int().nonnegative(),
  typeChanges: z.number().int().nonnegative(),
});

const ImpactItemSchema = z.object({
  transactionId: z.string(),
  description: z.string(),
  before: ClassificationOutcomeSchema,
  after: ClassificationOutcomeSchema,
});

export const ChangeSetProposalSchema = z.object({
  changeSet: ChangeSetSchema,
  rationale: z.string(),
  preview: z.object({ counts: ImpactCountsSchema, affected: z.array(ImpactItemSchema) }),
  targetRules: z.record(z.string(), CorrectionSchema),
});

export const ReviseChangeSetBody = z.object({
  signal: CorrectionSignalSchema,
  currentChangeSet: ChangeSetSchema,
  instruction: z.string().min(1).max(2000),
  triggeringTransactions: z
    .array(z.object({ checksum: z.string().optional(), description: z.string() }))
    .max(500),
});

export const ReviseResultSchema = z.object({
  changeSet: ChangeSetSchema,
  rationale: z.string(),
  targetRules: z.record(z.string(), CorrectionSchema),
});

export const RejectChangeSetBody = z.object({
  signal: CorrectionSignalSchema,
  changeSet: ChangeSetSchema,
  feedback: z.string().min(1),
  impactSummary: ChangeSetPreviewSummarySchema.optional(),
});
