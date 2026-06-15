/**
 * PRD-135 — type contracts for the per-draft inspector (`food.inbox.getForReview`).
 *
 * Split from the query implementation so the inspector's wire shapes stay
 * stable while the composer module mutates. Consumed by the API router type
 * inference (TS2883 forces the named export pattern across the package
 * boundary).
 *
 * The PRD spec described `compile_error.loc` as `{ line, col }` for brevity
 * but the underlying compile pipeline uses the full `SourceSpan` shape
 * (`startLine` / `startCol` / `endLine` / `endCol`). The inspector exposes
 * the real shape so the editor's existing diagnostic plumbing — which
 * already expects `SourceSpan` — stays parameter-stable.
 */
import type { PartialReason } from '../../contract/queue/index.js';
import type { SourceSpan } from '../../dsl/ast.js';
import type { CompilePhase } from '../../dsl/compile-types.js';
import type { QualityResult } from '../../inbox/quality.js';

export type IngestKind = 'url-web' | 'url-instagram' | 'text' | 'screenshot';

/**
 * Inspector-level state derivation. Mirrors PRD-125's `IngestStatus.state`
 * minus the BullMQ branch — the inspector can't reach Redis from the DB
 * layer, so in-flight rows surface as `processing` rather than discriminating
 * pending vs processing. The inspector polls at 60s while non-terminal so it
 * converges on the right state once the worker writes back.
 */
export type InspectorIngestState = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export interface InspectorAiInferenceLogRow {
  operation: string;
  provider: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: string;
  cached: boolean;
  createdAt: string;
}

export interface InspectorSourceView {
  id: number;
  kind: IngestKind;
  url: string | null;
  caption: string | null;
  ingestedAt: string;
  extractorVersion: string;
  state: InspectorIngestState;
  partialReason?: PartialReason;
  reviewedAt: string | null;
  archivedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  /** Full PRD-125 stages JSON (parsed). `null` when `extracted_json` is null or unparseable. */
  meta: Record<string, unknown> | null;
  /** PRD-133 rows where `context_id = 'ingest_source:' || sourceId`. */
  inferenceLogs: InspectorAiInferenceLogRow[];
  totalCostUsd: number;
}

export interface InspectorProposedSlugRow {
  slug: string;
  suggestedKind: 'ingredient' | 'recipe' | 'prep_state' | null;
  fromLoc: SourceSpan;
  createdAt: string;
}

/** PRD-135 enriched view of PRD-116's creations — adds parent slug + default unit. */
export interface InspectorResolverCreationRow {
  kind: 'ingredient' | 'variant';
  slug: string;
  parentIngredientSlug: string | null;
  defaultUnit: 'g' | 'ml' | 'count';
  createdAt: string;
}

/** Parsed shape of `recipe_versions.compile_error` per PRD-135 §Data. */
export interface InspectorCompileErrorParsed {
  phase: CompilePhase;
  errors: Array<{ code: string; message: string; loc?: SourceSpan }>;
  errorCount: number;
  proposedSlugsCount: number;
}

export interface InspectorDraftView {
  versionId: number;
  versionNo: number;
  recipeSlug: string;
  recipeArchivedAt: string | null;
  status: 'draft' | 'current' | 'archived';
  title: string | null;
  bodyDsl: string;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
  compileError: InspectorCompileErrorParsed | null;
  compiledAt: string | null;
  rejection: {
    reason: 'wrong-recipe' | 'low-quality-extraction' | 'duplicate' | 'not-a-recipe' | 'other';
    note: string | null;
    rejectedAt: string;
  } | null;
  proposedSlugs: InspectorProposedSlugRow[];
  creations: InspectorResolverCreationRow[];
  quality: QualityResult;
}

export interface InspectorReviewView {
  source: InspectorSourceView;
  draft: InspectorDraftView | null;
}

export type InspectorResult =
  | { ok: true; review: InspectorReviewView }
  | { ok: false; reason: 'SourceNotFound' };
