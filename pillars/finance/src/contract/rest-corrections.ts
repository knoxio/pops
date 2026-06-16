/**
 * Correction-rule ChangeSet zod schemas for the finance pillar.
 *
 * Mirrors the monolith `core/corrections/{correction-schemas,changeset-types}.ts`.
 * The corrections domain has no finance-owned REST routes of its own yet — the
 * imports pipeline is the only consumer, and it needs the ChangeSet shape both
 * on the wire (commit / applyChangeSetAndReevaluate / reevaluateWithPendingRules
 * payloads) and internally (the ported `applyChangeSet` + reevaluation logic).
 *
 * Authored standalone (not imported from the monolith barrel) per the severance
 * rules. Only the schemas + inferred types are exported; if a real corrections
 * route surfaces later it composes these.
 */
import { z } from 'zod';

const MatchTypeSchema = z.enum(['exact', 'contains', 'regex']);
const TransactionTypeSchema = z.enum(['purchase', 'transfer', 'income']);

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
