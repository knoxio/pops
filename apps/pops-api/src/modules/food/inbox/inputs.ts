/**
 * Zod input schemas for `food.inbox.*` — PRD-136.
 *
 * `note` is deliberately NOT capped here: length + `reason='other'`
 * note-required are part of the discriminated `{ ok: false, reason: ... }`
 * contract surfaced by `inboxService.rejectDraft`. If Zod rejected the
 * input first the UI would have to handle a TRPCError BAD_REQUEST instead
 * of the structured reasons (`NoteTooLong`, `NoteRequired`) the PRD-136 AC
 * lists.
 */
import { z } from 'zod';

const VersionIdSchema = z.object({ versionId: z.number().int().positive() });

export const ApproveInputSchema = VersionIdSchema;
export const UnrejectInputSchema = VersionIdSchema;

export const RejectInputSchema = z.object({
  versionId: z.number().int().positive(),
  reason: z.enum(['wrong-recipe', 'low-quality-extraction', 'duplicate', 'not-a-recipe', 'other']),
  note: z.string().optional(),
});
