/**
 * PRD-138 — Zod schemas for the inbox-list queries (`food.inbox.listRejected`
 * and `food.inbox.listFailed`).
 *
 * Kept in a sibling file so `inputs.ts` (PRD-136's approve/reject/unreject)
 * stays tight.
 */
import { z } from 'zod';

export const RejectionReasonSchema = z.enum([
  'wrong-recipe',
  'low-quality-extraction',
  'duplicate',
  'not-a-recipe',
  'other',
]);
export type RejectionReason = z.infer<typeof RejectionReasonSchema>;

export const IngestKindSchema = z.enum(['url-web', 'url-instagram', 'text', 'screenshot']);
export type IngestKind = z.infer<typeof IngestKindSchema>;

/** Allowed `sinceDays` chip values. `null` ⇒ "all time". */
export const SinceDaysSchema = z
  .union([z.literal(7), z.literal(30), z.literal(90), z.null()])
  .default(30);

export const CursorSchema = z.string().optional();
const ListLimit = z.coerce.number().int().positive().max(100).default(20);

/* ─── listRejected ─────────────────────────────────────────────────────── */

export const ListRejectedInput = z.object({
  reasons: z.array(RejectionReasonSchema).optional(),
  kinds: z.array(IngestKindSchema).optional(),
  sinceDays: SinceDaysSchema,
  cursor: CursorSchema,
  limit: ListLimit,
});
export type ListRejectedInput = z.infer<typeof ListRejectedInput>;

export const RejectedRowSchema = z.object({
  versionId: z.number().int().positive(),
  recipeSlug: z.string(),
  sourceId: z.number().int().positive(),
  title: z.string().nullable(),
  reason: RejectionReasonSchema,
  note: z.string().nullable(),
  rejectedAt: z.string(),
  ingestKind: IngestKindSchema,
  sourceUrl: z.string().nullable(),
  ingestCostUsd: z.number().nullable(),
});
export type RejectedRow = z.infer<typeof RejectedRowSchema>;

export const ListRejectedOutput = z.object({
  items: z.array(RejectedRowSchema),
  nextCursor: z.string().optional(),
});

/* ─── listFailed ───────────────────────────────────────────────────────── */

export const ListFailedInput = z.object({
  errorCodes: z.array(z.string().min(1)).optional(),
  kinds: z.array(IngestKindSchema).optional(),
  sinceDays: SinceDaysSchema,
  cursor: CursorSchema,
  limit: ListLimit,
});
export type ListFailedInput = z.infer<typeof ListFailedInput>;

export const FailedRowSchema = z.object({
  sourceId: z.number().int().positive(),
  ingestKind: IngestKindSchema,
  sourceUrl: z.string().nullable(),
  errorCode: z.string(),
  errorMessage: z.string(),
  ingestedAt: z.string(),
  attempts: z.number().int().nonnegative(),
});
export type FailedRow = z.infer<typeof FailedRowSchema>;

export const ListFailedOutput = z.object({
  items: z.array(FailedRowSchema),
  nextCursor: z.string().optional(),
});
