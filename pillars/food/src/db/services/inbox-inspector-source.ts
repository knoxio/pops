/**
 * PRD-135 — source-side reads + state derivation for the inspector.
 *
 * Reads the `ingest_sources` row. Derives `InspectorIngestState` from the DB
 * row only (no BullMQ): a row with an `error_code` is `failed`; a row with a
 * `draft_recipe_id` is `completed` (or `partial` when
 * `extracted_json.partialReason` is set); otherwise `processing`. The
 * inspector's 60s poll while non-terminal closes the gap with the worker.
 *
 * AI inference cost is no longer surfaced here: food's local `ai_inference_log`
 * was dropped once telemetry moved to the ai pillar via `@pops/ai-telemetry`
 * (#3490). `readInferenceLogs` returns an empty set so `totalCostUsd` is 0.
 */
import { eq } from 'drizzle-orm';

import { extractPartialReasonFromExtractedJson } from '../../inbox/partial-reason.js';
import { ingestSources } from '../schema.js';
import { parseExtractedMeta } from './inbox-inspector-parsers.js';
import { type FoodDb } from './internal.js';

import type { PartialReason } from '../../contract/queue/index.js';
import type {
  InspectorAiInferenceLogRow,
  InspectorIngestState,
  InspectorSourceView,
} from './inbox-inspector-types.js';

export interface InspectorSourceRow {
  id: number;
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  url: string | null;
  caption: string | null;
  extractedJson: string | null;
  extractorVersion: string;
  draftRecipeId: number | null;
  ingestedAt: string;
  archivedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  reviewedAt: string | null;
}

export function readSourceRow(db: FoodDb, sourceId: number): InspectorSourceRow | null {
  const rows = db
    .select({
      id: ingestSources.id,
      kind: ingestSources.kind,
      url: ingestSources.url,
      caption: ingestSources.caption,
      extractedJson: ingestSources.extractedJson,
      extractorVersion: ingestSources.extractorVersion,
      draftRecipeId: ingestSources.draftRecipeId,
      ingestedAt: ingestSources.ingestedAt,
      archivedAt: ingestSources.archivedAt,
      errorCode: ingestSources.errorCode,
      errorMessage: ingestSources.errorMessage,
      attempts: ingestSources.attempts,
      reviewedAt: ingestSources.reviewedAt,
    })
    .from(ingestSources)
    .where(eq(ingestSources.id, sourceId))
    .all();
  return rows[0] ?? null;
}

export function readInferenceLogs(_db: FoodDb, _sourceId: number): InspectorAiInferenceLogRow[] {
  return [];
}

export function buildSourceView(
  row: InspectorSourceRow,
  inferenceLogs: InspectorAiInferenceLogRow[]
): InspectorSourceView {
  const partialReason = extractPartialReasonFromExtractedJson(row.extractedJson);
  const totalCostUsd = inferenceLogs.reduce((acc, r) => acc + r.costUsd, 0);
  const base: Omit<InspectorSourceView, 'partialReason'> = {
    id: row.id,
    kind: row.kind,
    url: row.url,
    caption: row.caption,
    ingestedAt: row.ingestedAt,
    extractorVersion: row.extractorVersion,
    state: deriveInspectorState(row, partialReason),
    reviewedAt: row.reviewedAt,
    archivedAt: row.archivedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    meta: parseExtractedMeta(row.extractedJson),
    inferenceLogs,
    totalCostUsd,
  };
  return partialReason === undefined ? base : { ...base, partialReason };
}

function deriveInspectorState(
  row: InspectorSourceRow,
  partialReason: PartialReason | undefined
): InspectorIngestState {
  if (row.errorCode !== null || row.errorMessage !== null) return 'failed';
  if (row.draftRecipeId !== null) {
    return partialReason === undefined ? 'completed' : 'partial';
  }
  return 'processing';
}
