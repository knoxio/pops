/**
 * Zod for the `inbox.getForReview` inspector aggregate — mirrors
 * `InspectorReviewView` / `InspectorResult` from
 * `src/db/services/inbox-inspector-types.ts` verbatim so `api-types` fully
 * describes the wire shape. Split from `rest-inbox-schemas.ts` to keep that
 * file under the per-file line cap. Zod-only; no imports from `src/api/` or
 * `src/db/`.
 */
import { z } from 'zod';

import {
  CompileStatus,
  IngestKind,
  PartialReason,
  QualityBand,
  RejectionReason,
} from './rest-inbox-schemas.js';
import { SourceSpanSchema } from './rest-recipe-render-schemas.js';

const InspectorIngestState = z.enum(['pending', 'processing', 'completed', 'failed', 'partial']);

const CompilePhase = z.enum(['parse', 'resolve', 'cycle', 'materialise']);

const InspectorAiInferenceLogRowSchema = z.object({
  operation: z.string(),
  provider: z.string(),
  model: z.string(),
  costUsd: z.number(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  latencyMs: z.number(),
  status: z.string(),
  cached: z.boolean(),
  createdAt: z.string(),
});

const InspectorSourceViewSchema = z.object({
  id: z.number().int(),
  kind: IngestKind,
  url: z.string().nullable(),
  caption: z.string().nullable(),
  ingestedAt: z.string(),
  extractorVersion: z.string(),
  state: InspectorIngestState,
  partialReason: PartialReason.optional(),
  reviewedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attempts: z.number().int(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  inferenceLogs: z.array(InspectorAiInferenceLogRowSchema),
  totalCostUsd: z.number(),
});

const InspectorProposedSlugRowSchema = z.object({
  slug: z.string(),
  suggestedKind: z.enum(['ingredient', 'recipe', 'prep_state']).nullable(),
  fromLoc: SourceSpanSchema,
  createdAt: z.string(),
});

const InspectorResolverCreationRowSchema = z.object({
  kind: z.enum(['ingredient', 'variant']),
  slug: z.string(),
  parentIngredientSlug: z.string().nullable(),
  defaultUnit: z.enum(['g', 'ml', 'count']),
  createdAt: z.string(),
});

const InspectorCompileErrorParsedSchema = z.object({
  phase: CompilePhase,
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      loc: SourceSpanSchema.optional(),
    })
  ),
  errorCount: z.number().int(),
  proposedSlugsCount: z.number().int(),
});

const QualitySignalSchema = z.object({
  code: z.string(),
  weight: z.number(),
  detail: z.string().optional(),
});

const QualityResultSchema = z.object({
  band: QualityBand,
  score: z.number(),
  signals: z.array(QualitySignalSchema),
});

const InspectorDraftViewSchema = z.object({
  versionId: z.number().int(),
  versionNo: z.number().int(),
  recipeSlug: z.string(),
  recipeArchivedAt: z.string().nullable(),
  status: z.enum(['draft', 'current', 'archived']),
  title: z.string().nullable(),
  bodyDsl: z.string(),
  compileStatus: CompileStatus,
  compileError: InspectorCompileErrorParsedSchema.nullable(),
  compiledAt: z.string().nullable(),
  rejection: z
    .object({
      reason: RejectionReason,
      note: z.string().nullable(),
      rejectedAt: z.string(),
    })
    .nullable(),
  proposedSlugs: z.array(InspectorProposedSlugRowSchema),
  creations: z.array(InspectorResolverCreationRowSchema),
  quality: QualityResultSchema,
});

export const InspectorReviewViewSchema = z.object({
  source: InspectorSourceViewSchema,
  draft: InspectorDraftViewSchema.nullable(),
});
