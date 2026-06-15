/**
 * Service-layer guards enforce the kind/url invariant (`url` required for
 * `kind ∈ {url-web, url-instagram}`). The DB CHECK handles the enum.
 */
import { eq } from 'drizzle-orm';

import { IngestSourceNotFound, IngestSourceUrlRequired } from '../errors.js';
import { ingestSources, type IngestSourceKind, type IngestSourceRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export interface CreateIngestSourceInput {
  kind: IngestSourceKind;
  extractorVersion: string;
  url?: string | null;
  caption?: string | null;
  transcriptPath?: string | null;
  keyframesDir?: string | null;
  videoPath?: string | null;
  extractedJson?: string | null;
  draftRecipeId?: number | null;
}

export function createIngestSource(db: FoodDb, input: CreateIngestSourceInput): IngestSourceRow {
  if ((input.kind === 'url-web' || input.kind === 'url-instagram') && !input.url) {
    throw new IngestSourceUrlRequired(input.kind);
  }
  const rows = db
    .insert(ingestSources)
    .values({
      kind: input.kind,
      url: input.url ?? null,
      caption: input.caption ?? null,
      transcriptPath: input.transcriptPath ?? null,
      keyframesDir: input.keyframesDir ?? null,
      videoPath: input.videoPath ?? null,
      extractedJson: input.extractedJson ?? null,
      extractorVersion: input.extractorVersion,
      draftRecipeId: input.draftRecipeId ?? null,
    })
    .returning()
    .all();
  return expectRow(rows, 'createIngestSource');
}

/**
 * Link an existing ingest_sources row to the recipe that the LLM
 * extraction created. Idempotent — overwriting with the same value is a
 * no-op; setting a different value overwrites the FK (allowed because the
 * worker may re-run the pipeline for partial drafts).
 */
export function linkDraftRecipe(
  db: FoodDb,
  sourceId: number,
  draftRecipeId: number
): IngestSourceRow {
  const rows = db
    .update(ingestSources)
    .set({ draftRecipeId })
    .where(eq(ingestSources.id, sourceId))
    .returning()
    .all();
  const row = rows[0];
  if (row === undefined) throw new IngestSourceNotFound(sourceId);
  return row;
}

/**
 * Mark `archived_at = now` for the given source ids. Called by the FIFO
 * eviction job after the on-disk directory has been removed. Path columns
 * are preserved — they describe where the files used to live.
 *
 * Implemented as a loop of single-row UPDATEs to keep the helper
 * dependency-light. Batch size is whatever `runEvictionTick` evicted in
 * one pass — usually small (often 0–5) because the job runs frequently,
 * but the implementation imposes no upper bound.
 */
export function markArchived(db: FoodDb, sourceIds: readonly number[]): void {
  const stamp = new Date().toISOString();
  for (const id of sourceIds) {
    db.update(ingestSources).set({ archivedAt: stamp }).where(eq(ingestSources.id, id)).run();
  }
}
