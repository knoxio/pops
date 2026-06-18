/**
 * Types for the corrections AI cluster (analyze / generate-rules / propose /
 * revise / reject). Ported from the monolith `core/corrections` so the wire
 * shapes match `core.corrections.*` for the FE cut-over. The deterministic
 * ChangeSet types live in `../../../contract/rest-corrections-schemas.ts`.
 */
import { z } from 'zod';

import { type ChangeSet } from '../../../contract/rest-corrections.js';
import { type TransactionCorrectionRow } from '../../../db/index.js';
import { parseCorrectionTags, type CorrectionRow } from './types.js';

const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);
const TransactionTypeSchema = z.enum(['purchase', 'transfer', 'income']);

/** A user's intended correction rule (the trigger for a proposal). */
export const CorrectionSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: MatchTypeSchema,
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: TransactionTypeSchema.nullable().optional(),
});
export type CorrectionSignal = z.infer<typeof CorrectionSignalSchema>;

/** The AI-adapted signal shares the signal shape. */
export const AdaptedSignalSchema = CorrectionSignalSchema;

/** Result of `analyzeCorrection` — a derived, validated rule. */
export const CorrectionAnalysisSchema = z.object({
  matchType: MatchTypeSchema,
  pattern: z.string(),
  confidence: z.number(),
});
export type CorrectionAnalysis = z.infer<typeof CorrectionAnalysisSchema>;

/** A single proposal from `generateRules`. */
export const ProposedRuleSchema = z.object({
  descriptionPattern: z.string(),
  matchType: MatchTypeSchema,
  tags: z.array(z.string()),
  reasoning: z.string(),
});
export type ProposedRule = z.infer<typeof ProposedRuleSchema>;

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

/** The persisted-correction projection used in proposal `targetRules`. */
export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export function toCorrection(row: TransactionCorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseCorrectionTags(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    priority: row.priority,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export interface ChangeSetProposal {
  changeSet: ChangeSet;
  rationale: string;
  preview: { counts: ChangeSetImpactCounts; affected: ChangeSetImpactItem[] };
  targetRules: Record<string, Correction>;
}

/** Build the `id → Correction` map for the rules a ChangeSet's edit/disable/remove ops target. */
export function buildTargetRulesMap(
  changeSet: ChangeSet,
  rulesBefore: CorrectionRow[]
): Record<string, Correction> {
  const byId = new Map(rulesBefore.map((r) => [r.id, r]));
  const out: Record<string, Correction> = {};
  for (const op of changeSet.ops) {
    if (op.op === 'add') continue;
    const row = byId.get(op.id);
    if (row) out[op.id] = toCorrection(row);
  }
  return out;
}
