/**
 * PRD-134 — Zod input schema for `food.inbox.list`.
 *
 * Kept in a sibling file so each PRD's surface stays self-contained and so
 * `router.ts` doesn't blow past the per-file lint cap as more queries land.
 */
import { z } from 'zod';

import { DEFAULT_INBOX_LIST_LIMIT, MAX_INBOX_LIST_LIMIT } from './list-inputs.js';

const QualityBandSchema = z.enum(['clean', 'minor', 'attention', 'blocked']);
const IngestKindSchema = z.enum(['url-web', 'url-instagram', 'text', 'screenshot']);
const PartialReasonSchema = z.enum([
  'auth-dead',
  'rate-limited',
  'stt-failed',
  'vision-failed',
  'caption-only-fallback',
  'empty-extraction',
]);
const DraftSortSchema = z.enum(['quality-asc', 'quality-desc', 'oldest', 'newest']);

export const ListDraftsInputSchema = z.object({
  bands: z.array(QualityBandSchema).optional(),
  kinds: z.array(IngestKindSchema).optional(),
  partialReasons: z.array(PartialReasonSchema).optional(),
  freshOnly: z.boolean().optional(),
  sort: DraftSortSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(MAX_INBOX_LIST_LIMIT).optional(),
});

export type ListDraftsInput = z.infer<typeof ListDraftsInputSchema>;
export { DEFAULT_INBOX_LIST_LIMIT };
