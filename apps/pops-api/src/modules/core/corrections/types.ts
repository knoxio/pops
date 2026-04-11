import { z } from "zod";
import type { TransactionCorrectionRow } from "@pops/db-types";
import { parseJsonStringArray } from "../../../shared/json.js";

export type CorrectionRow = TransactionCorrectionRow;

/** Confidence threshold above which a correction match is considered definitive */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export type CorrectionMatchStatus = "matched" | "uncertain";

/** Result of matching a description against correction rules */
export interface CorrectionMatchResult {
  correction: CorrectionRow;
  status: CorrectionMatchStatus;
}

/** Classify a correction match based on confidence */
export function classifyCorrectionMatch(correction: CorrectionRow): CorrectionMatchResult {
  return {
    correction,
    status: correction.confidence >= HIGH_CONFIDENCE_THRESHOLD ? "matched" : "uncertain",
  };
}

/**
 * API response shape (camelCase)
 */
export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: "exact" | "contains" | "regex";
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: "purchase" | "transfer" | "income" | null;
  isActive: boolean;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Map a SQLite row to API response shape
 */
export function toCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseJsonStringArray(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * Normalize description for pattern matching
 */
export function normalizeDescription(description: string): string {
  return description
    .toUpperCase()
    .replace(/\d+/g, "") // Remove numbers
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Zod schema for creating a correction
 */
export const CreateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(["exact", "contains", "regex"]).default("exact"),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
});
export type CreateCorrectionInput = z.infer<typeof CreateCorrectionSchema>;

/**
 * Correction signal: the user's intended rule definition (pattern + attributes).
 * Used for proposal generation and rejection feedback association.
 */
export const CorrectionSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(["exact", "contains", "regex"]),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
});
export type CorrectionSignal = z.infer<typeof CorrectionSignalSchema>;

export const AdaptedSignalSchema = CorrectionSignalSchema;

/**
 * Zod schema for updating a correction
 */
export const UpdateCorrectionSchema = z.object({
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type UpdateCorrectionInput = z.infer<typeof UpdateCorrectionSchema>;

// ---------------------------------------------------------------------------
// ChangeSet contract (PRD-028 US-01 / Issue #1642) — classification corrections
// ---------------------------------------------------------------------------

export const CorrectionRuleDataSchema = CreateCorrectionSchema.extend({
  confidence: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type CorrectionRuleData = z.infer<typeof CorrectionRuleDataSchema>;

export const ChangeSetAddOpSchema = z.object({
  op: z.literal("add"),
  data: CorrectionRuleDataSchema,
});

export const ChangeSetEditOpSchema = z.object({
  op: z.literal("edit"),
  id: z.string().min(1),
  data: UpdateCorrectionSchema,
});

export const ChangeSetDisableOpSchema = z.object({
  op: z.literal("disable"),
  id: z.string().min(1),
});

export const ChangeSetRemoveOpSchema = z.object({
  op: z.literal("remove"),
  id: z.string().min(1),
});

export const ChangeSetOpSchema = z.discriminatedUnion("op", [
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

export interface CorrectionMatchSummary {
  matched: boolean;
  status: CorrectionMatchStatus | null;
  ruleId: string | null;
  confidence: number | null;
}

export interface ChangeSetPreviewDiff {
  checksum?: string;
  description: string;
  before: CorrectionMatchSummary;
  after: CorrectionMatchSummary;
  changed: boolean;
}

export interface ChangeSetPreviewSummary {
  total: number;
  newMatches: number;
  removedMatches: number;
  statusChanges: number;
  netMatchedDelta: number;
}

// ---------------------------------------------------------------------------
// ChangeSet proposal + impact preview (Issue #1643)
// ---------------------------------------------------------------------------

export interface CorrectionClassificationOutcome {
  ruleId: string | null;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: "purchase" | "transfer" | "income" | null;
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
  /**
   * Hydrated snapshots of every existing rule referenced by a non-`add` op
   * in the `changeSet` (keyed by rule id). The frontend uses this to scope
   * preview re-runs correctly for `edit`/`disable`/`remove` ops without
   * having to round-trip through `core.corrections.list`.
   *
   * Always populated (even if empty) so callers don't need optional chaining.
   */
  targetRules: Record<string, Correction>;
}

/**
 * Zod schema for finding matching correction
 */
export const FindCorrectionSchema = z.object({
  description: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.7),
});
export type FindCorrectionInput = z.infer<typeof FindCorrectionSchema>;
