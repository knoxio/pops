import { z } from 'zod';

import { ChangeSetImpactSummarySchema, ChangeSetSchema, CorrectionSignalSchema } from './types.js';

export const PREVIEW_RULES_FETCH_LIMIT = 50_000;

export const previewInput = z.object({
  changeSet: ChangeSetSchema,
  transactions: z
    .array(
      z.object({
        checksum: z.string().optional(),
        description: z.string().min(1),
      })
    )
    .min(1)
    .max(2000),
  minConfidence: z.number().min(0).max(1).default(0.7),
  pendingChangeSets: z
    .array(z.object({ changeSet: ChangeSetSchema }))
    .max(200)
    .optional(),
});

export const reviseInput = z.object({
  signal: CorrectionSignalSchema,
  currentChangeSet: ChangeSetSchema,
  instruction: z.string().min(1).max(2000),
  triggeringTransactions: z
    .array(z.object({ checksum: z.string().optional(), description: z.string() }))
    .max(500),
});

export const proposeInput = z.object({
  signal: CorrectionSignalSchema,
  minConfidence: z.number().min(0).max(1).default(0.7),
  maxPreviewItems: z.coerce.number().int().positive().max(500).default(200),
});

export const rejectInput = z.object({
  signal: CorrectionSignalSchema,
  changeSet: ChangeSetSchema,
  feedback: z.string().min(1),
  impactSummary: ChangeSetImpactSummarySchema.optional(),
});
