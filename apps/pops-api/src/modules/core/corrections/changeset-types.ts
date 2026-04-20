import { z } from 'zod';

import { CreateCorrectionSchema, UpdateCorrectionSchema } from './correction-schemas.js';

import type { Correction } from './types-base.js';

export const CorrectionRuleDataSchema = CreateCorrectionSchema.extend({
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type CorrectionRuleData = z.infer<typeof CorrectionRuleDataSchema>;

export const ChangeSetAddOpSchema = z.object({
  op: z.literal('add'),
  data: CorrectionRuleDataSchema,
});

export const ChangeSetEditOpSchema = z.object({
  op: z.literal('edit'),
  id: z.string().min(1),
  data: UpdateCorrectionSchema,
});

export const ChangeSetDisableOpSchema = z.object({
  op: z.literal('disable'),
  id: z.string().min(1),
});

export const ChangeSetRemoveOpSchema = z.object({
  op: z.literal('remove'),
  id: z.string().min(1),
});

export const ChangeSetOpSchema = z.discriminatedUnion('op', [
  ChangeSetAddOpSchema,
  ChangeSetEditOpSchema,
  ChangeSetDisableOpSchema,
  ChangeSetRemoveOpSchema,
]);
export type ChangeSetOp = z.infer<typeof ChangeSetOpSchema>;

export const ChangeSetSchema = z.object({
  source: z.string().optional(),
  reason: z.string().optional(),
  ops: z.array(ChangeSetOpSchema).min(1),
});
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

export const ChangeSetImpactSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  newMatches: z.number().int().nonnegative(),
  removedMatches: z.number().int().nonnegative(),
  statusChanges: z.number().int().nonnegative(),
  netMatchedDelta: z.number().int(),
});
export type ChangeSetImpactSummary = z.infer<typeof ChangeSetImpactSummarySchema>;

export interface CorrectionClassificationOutcome {
  ruleId: string | null;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
}

export interface ChangeSetImpactCounts {
  affected: number;
  entityChanges: number;
  locationChanges: number;
  tagChanges: number;
  typeChanges: number;
}

export interface ChangeSetImpactItem {
  transactionId: string;
  description: string;
  before: CorrectionClassificationOutcome;
  after: CorrectionClassificationOutcome;
}

export interface ChangeSetProposal {
  changeSet: ChangeSet;
  rationale: string;
  preview: {
    counts: ChangeSetImpactCounts;
    affected: ChangeSetImpactItem[];
  };
  targetRules: Record<string, Correction>;
}
