/**
 * PRD-125 — Zod schemas for `food.ingest.*` tRPC procedures.
 *
 * Mirrors the shape of `@pops/food-contracts`'s runtime types. Kept in a
 * sibling file so the router stays tight.
 *
 * IngestJobResult validation deliberately accepts `meta` as `z.any()` —
 * the per-handler PRDs (127–132) own the `stages` payload shape and we
 * don't want the producer rejecting handler innovations. The router only
 * cares about the discriminator + the fields it writes to `ingest_sources`.
 */
import { z } from 'zod';

/** Subset of valid screenshot mime types — matches PRD-110's `screenshot.<ext>` amendment. */
export const ScreenshotMimeType = z.enum(['image/jpeg', 'image/png', 'image/webp']);

/** Mirrors `PartialReason` from `@pops/food-contracts` so the wire surface
 *  rejects values outside the contract. The handler PRDs (127–132) emit
 *  exactly these strings; widening here would let a misbehaving worker leak
 *  arbitrary strings into the inbox UI. */
export const PartialReasonSchema = z.enum([
  'auth-dead',
  'rate-limited',
  'stt-failed',
  'vision-failed',
  'caption-only-fallback',
  'empty-extraction',
]);

export const IngestStartInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url-web'), url: z.url() }),
  z.object({ kind: z.literal('url-instagram'), url: z.url() }),
  z.object({ kind: z.literal('text'), body: z.string().min(1) }),
  z.object({
    kind: z.literal('screenshot'),
    mimeType: ScreenshotMimeType,
    contentBase64: z.string().min(1),
  }),
]);
export type IngestStartInput = z.infer<typeof IngestStartInput>;

export const IngestStartOutput = z.object({
  sourceId: z.number().int().positive(),
  jobId: z.string(),
  queuedAt: z.string().datetime(),
});

export const IngestState = z.enum(['pending', 'processing', 'completed', 'failed', 'partial']);

export const IngestStatusOutput = z.object({
  sourceId: z.number().int().positive(),
  kind: z.enum(['url-web', 'url-instagram', 'text', 'screenshot']),
  state: IngestState,
  jobId: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  draftRecipeId: z.number().int().positive().nullable(),
  partialReason: PartialReasonSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  attempts: z.number().int().nonnegative(),
});

export const IngestListInput = z.object({
  state: IngestState.optional(),
  /** Forward-only cursor = the smallest seen `id` from the previous page. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const IngestListOutput = z.object({
  items: z.array(IngestStatusOutput),
  nextCursor: z.string().optional(),
});

export const IngestCancelInput = z.object({ sourceId: z.number().int().positive() });
export const IngestCancelOutput = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.literal('not-cancellable') }),
]);

export const IngestRetryInput = z.object({ sourceId: z.number().int().positive() });
export const IngestRetryOutput = z.object({
  jobId: z.string(),
  queuedAt: z.string().datetime(),
});

const MetaSchema = z
  .object({
    extractor_version: z.string(),
    stages: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const WorkerCompleteInput = z.discriminatedUnion('ok', [
  z.object({
    sourceId: z.number().int().positive(),
    ok: z.literal(true),
    dsl: z.string().min(1),
    meta: MetaSchema,
    partialReason: PartialReasonSchema.optional(),
  }),
  z.object({
    sourceId: z.number().int().positive(),
    ok: z.literal(false),
    errorCode: z.string().min(1),
    errorMessage: z.string().min(1),
    meta: MetaSchema,
  }),
]);

export const WorkerCompleteOutput = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    draftRecipeId: z.number().int().positive(),
    compileStatus: z.enum(['compiled', 'failed', 'uncompiled']),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
