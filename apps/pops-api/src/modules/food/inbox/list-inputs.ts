/**
 * PRD-138 — Zod input schemas for `food.inbox.list{Rejected,Failed}`.
 *
 * Kept in a sibling file from `inputs.ts` (PRD-136 mutations) so each PRD's
 * surface stays self-contained and growable. The `limit` is capped at 100
 * to make the worst-case row trim bounded; the PRD's default is 20.
 */
import { z } from 'zod';

const SinceDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]);

const IngestKindSchema = z.enum(['url-web', 'url-instagram', 'text', 'screenshot']);

const RejectionReasonSchema = z.enum([
  'wrong-recipe',
  'low-quality-extraction',
  'duplicate',
  'not-a-recipe',
  'other',
]);

export const DEFAULT_INBOX_LIST_LIMIT = 20;
export const MAX_INBOX_LIST_LIMIT = 100;

export const ListRejectedInputSchema = z.object({
  reasons: z.array(RejectionReasonSchema).optional(),
  kinds: z.array(IngestKindSchema).optional(),
  sinceDays: SinceDaysSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(MAX_INBOX_LIST_LIMIT).optional(),
});

export const ListFailedInputSchema = z.object({
  errorCodes: z.array(z.string().min(1)).optional(),
  kinds: z.array(IngestKindSchema).optional(),
  sinceDays: SinceDaysSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(MAX_INBOX_LIST_LIMIT).optional(),
});

export type ListRejectedInput = z.infer<typeof ListRejectedInputSchema>;
export type ListFailedInput = z.infer<typeof ListFailedInputSchema>;
