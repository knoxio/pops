/**
 * Glia wire schemas.
 *
 * Split out of `rest-glia.ts` so the contract file stays within the per-file
 * line budget. These schemas are glia-only — `rest-schemas.ts` holds the
 * cross-domain shared envelopes; this file holds the glia trust/action shapes.
 */
import { z } from 'zod';

export const gliaActionTypeSchema = z.enum(['prune', 'consolidate', 'link', 'audit']);
export type GliaActionTypeWire = z.infer<typeof gliaActionTypeSchema>;

export const gliaActionStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'executed',
  'reverted',
]);
export type GliaActionStatusWire = z.infer<typeof gliaActionStatusSchema>;

export const gliaTrustPhaseSchema = z.enum(['propose', 'act_report', 'silent']);
export type GliaTrustPhaseWire = z.infer<typeof gliaTrustPhaseSchema>;

export const gliaUserDecisionSchema = z.enum(['approve', 'reject', 'modify']);
export type GliaUserDecisionWire = z.infer<typeof gliaUserDecisionSchema>;

/** A glia action record — one row from `glia_actions` deserialised. */
export const gliaActionSchema = z.object({
  id: z.string().min(1),
  actionType: gliaActionTypeSchema,
  affectedIds: z.array(z.string()),
  rationale: z.string(),
  payload: z.unknown().nullable(),
  phase: gliaTrustPhaseSchema,
  status: gliaActionStatusSchema,
  userDecision: gliaUserDecisionSchema.nullable(),
  userNote: z.string().nullable(),
  executedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  revertedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type GliaActionWire = z.infer<typeof gliaActionSchema>;

/** Trust state for a single action type — one row from `glia_trust_state`. */
export const gliaTrustStateSchema = z.object({
  actionType: gliaActionTypeSchema,
  currentPhase: gliaTrustPhaseSchema,
  approvedCount: z.number().int(),
  rejectedCount: z.number().int(),
  revertedCount: z.number().int(),
  autonomousSince: z.string().nullable(),
  lastRevertAt: z.string().nullable(),
  graduatedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type GliaTrustStateWire = z.infer<typeof gliaTrustStateSchema>;

/** Result of an eager graduation/demotion check after a decision or revert. */
export const gliaTransitionResultSchema = z.object({
  transitioned: z.boolean(),
  actionType: gliaActionTypeSchema,
  oldPhase: gliaTrustPhaseSchema,
  newPhase: gliaTrustPhaseSchema,
  reason: z.string(),
});
export type GliaTransitionResultWire = z.infer<typeof gliaTransitionResultSchema>;

/** Outcome of the file-level revert performed after a DB-state revert. */
export const gliaRevertResultSchema = z.object({
  success: z.boolean(),
  restoredIds: z.array(z.string()),
  errors: z.array(z.string()),
});
export type GliaRevertResultWire = z.infer<typeof gliaRevertResultSchema>;

/** Filters shared by `actions.list` and `actions.history`. */
export const gliaActionFilterSchema = z.object({
  actionType: gliaActionTypeSchema.optional(),
  status: gliaActionStatusSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
});

/** One autonomous action surfaced in the digest. */
const gliaDigestActionEntrySchema = z.object({
  id: z.string(),
  affectedIds: z.array(z.string()),
  rationale: z.string(),
  executedAt: z.string(),
});

/** Per action-type grouping in the digest. */
const gliaDigestActionGroupSchema = z.object({
  actionType: gliaActionTypeSchema,
  count: z.number().int(),
  actions: z.array(gliaDigestActionEntrySchema),
});

/** Post-graduation rejection-rate anomaly. */
const gliaDigestAnomalySchema = z.object({
  actionType: gliaActionTypeSchema,
  rejectionRatePostGraduation: z.number(),
  threshold: z.number(),
  autonomousSince: z.string(),
  executedCount: z.number().int(),
  revertedCount: z.number().int(),
});

/** The full autonomous digest payload. */
export const gliaDigestReportSchema = z.object({
  period: z.enum(['daily', 'weekly']),
  startDate: z.string(),
  endDate: z.string(),
  totalAutonomousActions: z.number().int(),
  groups: z.array(gliaDigestActionGroupSchema),
  anomalies: z.array(gliaDigestAnomalySchema),
});
export type GliaDigestReportWire = z.infer<typeof gliaDigestReportSchema>;

/** Outcome of a single digest delivery channel. */
const gliaDeliveryChannelResultSchema = z.object({
  channel: z.enum(['shell', 'moltbot']),
  delivered: z.boolean(),
  reason: z.string().nullable(),
});

/** The digest delivery envelope (attempted / suppressed + per-channel). */
export const gliaDigestDeliverySchema = z.object({
  attempted: z.boolean(),
  suppressedReason: z.string().nullable(),
  channels: z.array(gliaDeliveryChannelResultSchema),
});
export type GliaDigestDeliveryWire = z.infer<typeof gliaDigestDeliverySchema>;
