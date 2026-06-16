/**
 * Shared zod building blocks for the `inbox.*` REST contract — enums, row
 * schemas, page wrappers, and the approve/reject/unreject result unions.
 * Split from `rest-inbox.ts` to keep that file's path map under the
 * per-file line cap. Zod-only; no imports from `src/api/` or `src/db/`.
 */
import { z } from 'zod';

export const IngestKind = z.enum(['url-web', 'url-instagram', 'text', 'screenshot']);
export const RecipeType = z.enum([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);
export const QualityBand = z.enum(['clean', 'minor', 'attention', 'blocked']);
export const CompileStatus = z.enum(['uncompiled', 'compiled', 'failed']);
export const PartialReason = z.enum([
  'auth-dead',
  'rate-limited',
  'stt-failed',
  'vision-failed',
  'caption-only-fallback',
  'empty-extraction',
]);
export const RejectionReason = z.enum([
  'wrong-recipe',
  'low-quality-extraction',
  'duplicate',
  'not-a-recipe',
  'other',
]);
export const DraftSort = z.enum(['quality-asc', 'quality-desc', 'oldest', 'newest']);
export const SinceDays = z.union([z.literal(7), z.literal(30), z.literal(90)]);

const ApproveRejectError = z.enum([
  'NotIngestOriginated',
  'VersionNotFound',
  'NotADraft',
  'NotArchived',
  'NoRejectionRecord',
  'NotCompiled',
  'AlreadyReviewed',
  'RecipeArchived',
  'ConcurrentPromotion',
  'NoteRequired',
  'NoteTooLong',
]);

const Failure = z.object({ ok: z.literal(false), reason: ApproveRejectError });

export const ApproveResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), recipeSlug: z.string(), promotedVersionNo: z.number().int() }),
  Failure,
]);
export const RejectResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  Failure,
]);
export const UnrejectResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), restoredAs: z.literal('draft') }),
  Failure,
]);

const QualitySignalSchema = z.object({
  code: z.string(),
  weight: z.number(),
  detail: z.string().optional(),
});

const InboxDraftRowSchema = z.object({
  sourceId: z.number().int(),
  versionId: z.number().int(),
  recipeSlug: z.string(),
  title: z.string().nullable(),
  recipeType: RecipeType.nullable(),
  ingestKind: IngestKind,
  sourceUrl: z.string().nullable(),
  ingestedAt: z.string(),
  qualityBand: QualityBand,
  qualityScore: z.number(),
  topSignals: z.array(QualitySignalSchema),
  partialReason: PartialReason.optional(),
  proposedSlugCount: z.number().int(),
  creationCount: z.number().int(),
  compileStatus: CompileStatus,
});

const RejectedRowSchema = z.object({
  versionId: z.number().int(),
  recipeSlug: z.string(),
  sourceId: z.number().int(),
  title: z.string().nullable(),
  reason: RejectionReason,
  note: z.string().nullable(),
  rejectedAt: z.string(),
  ingestKind: IngestKind,
  sourceUrl: z.string().nullable(),
  ingestCostUsd: z.number().nullable(),
});

const FailedRowSchema = z.object({
  sourceId: z.number().int(),
  ingestKind: IngestKind,
  sourceUrl: z.string().nullable(),
  errorCode: z.string(),
  errorMessage: z.string(),
  ingestedAt: z.string(),
  attempts: z.number().int(),
});

export const DraftsPage = z.object({
  items: z.array(InboxDraftRowSchema),
  nextCursor: z.string().nullable(),
});
export const RejectedPage = z.object({
  items: z.array(RejectedRowSchema),
  nextCursor: z.string().nullable(),
});
export const FailedPage = z.object({
  items: z.array(FailedRowSchema),
  nextCursor: z.string().nullable(),
});
