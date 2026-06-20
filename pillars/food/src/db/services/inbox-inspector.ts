/**
 * PRD-135 — `food.inbox.getForReview` service entry-point.
 *
 * One service call composes the inspector view:
 *
 *   - source pane: `ingest_sources` row + `ai_inference_log` cost rollup
 *     (see `inbox-inspector-source.ts`).
 *   - draft pane: most-recent `recipe_versions` row for the source +
 *     rejection row + proposed slugs + creations + PRD-137 quality
 *     (see `inbox-inspector-draft.ts`).
 *   - JSON parsing for `compile_error` + `extracted_json`
 *     (see `inbox-inspector-parsers.ts`).
 *
 * Each sub-module owns its read so the entry-point stays under the 200-line
 * lint cap and the surface area for future-PRD amendments is local. Result
 * shape is the discriminated `InspectorResult` so the API router can stay
 * a 1-line pass-through.
 */
import { buildDraftView } from './inbox-inspector-draft.js';
import { buildSourceView, readInferenceLogs, readSourceRow } from './inbox-inspector-source.js';
import { type FoodDb } from './internal.js';

import type { InspectorResult, InspectorReviewView } from './inbox-inspector-types.js';

export type {
  InspectorAiInferenceLogRow,
  InspectorCompileErrorParsed,
  InspectorDraftView,
  InspectorIngestState,
  InspectorProposedSlugRow,
  InspectorResolverCreationRow,
  InspectorResult,
  InspectorReviewView,
  InspectorSourceView,
  IngestKind as InspectorIngestKind,
} from './inbox-inspector-types.js';

export function getInspectorView(db: FoodDb, sourceId: number): InspectorResult {
  const sourceRow = readSourceRow(db, sourceId);
  if (sourceRow === null) return { ok: false, reason: 'SourceNotFound' };

  const inferenceLogs = readInferenceLogs(db, sourceId);
  const source = buildSourceView(sourceRow, inferenceLogs);

  // PRD-135 §Route — a source can exist without a draft (pending /
  // processing / failed paths). The draft view is null in that case and
  // the page renders the degraded layout (provenance pane only).
  const draft = sourceRow.draftRecipeId === null ? null : buildDraftView(db, sourceRow.id);

  const review: InspectorReviewView = { source, draft };
  return { ok: true, review };
}
