/**
 * PRD-113 phase 3 seed step — ingest_sources rows.
 *
 * Split into two halves because the row → recipe linkage is bidirectional:
 *
 *   - `seedIngestSources` inserts the rows BEFORE `step-recipes` runs. The
 *     freshly-minted `ingest_sources.id` values get stashed in
 *     `ctx.ingestSourceIdByRecipeSlug` so `seedRecipeHeaders` can pass them
 *     through as `recipe_versions.source_id` at create time.
 *
 *   - `linkIngestSourcesToDrafts` runs AFTER `step-recipes` to patch each
 *     ingest_sources row's `draft_recipe_id` FK to point at the recipe that
 *     was drafted from it. Service-layer `linkDraftRecipe` enforces the
 *     existence check.
 *
 * Path layout. PRD-110 stores `transcript_path` / `keyframes_dir` /
 * `video_path` as paths relative to `FOOD_INGEST_DIR`, prefixed with the
 * per-source subdirectory `<source_id>/...` (PRD-110 § Filesystem Layout
 * — "e.g. 42/video.mp4"). The fixtures declare bare filenames; this step
 * patches them with the id-prefixed form via an UPDATE immediately after
 * `createIngestSource` returns. Doing it as a post-insert patch (rather
 * than predicting the auto-increment id) matches how the worker (PRD-126)
 * actually behaves: insert the source row first, then write the files
 * under the freshly-assigned `<id>/` subdir.
 *
 * The two-pass shape (insert → link) matches the worker for the same
 * reason: failures still leave provenance behind.
 *
 * Inserts go through the `createIngestSource` service so the kind/url
 * invariant and CHECK enforcement get exercised at seed time too.
 */
import { eq } from 'drizzle-orm';

import { ingestSources } from '../db/schema.js';
import { createIngestSource, linkDraftRecipe } from '../db/services/ingest-sources.js';
import { INGEST_SOURCE_FIXTURES, type IngestSourceFixture } from './data-ingest-sources.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

/**
 * Build the PRD-110-compliant relative-path columns for a given source id.
 * Null inputs stay null (e.g. url-web rows have no transcript/video).
 */
function prefixedPaths(
  sourceId: number,
  fixture: IngestSourceFixture
): { transcriptPath: string | null; keyframesDir: string | null; videoPath: string | null } {
  const prefix = (suffix: string | null): string | null =>
    suffix === null ? null : `${sourceId}/${suffix}`;
  return {
    transcriptPath: prefix(fixture.transcriptPath),
    keyframesDir: prefix(fixture.keyframesDir),
    videoPath: prefix(fixture.videoPath),
  };
}

export function seedIngestSources(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of INGEST_SOURCE_FIXTURES) {
    const row = createIngestSource(db, {
      kind: fixture.kind,
      url: fixture.url,
      caption: fixture.caption,
      transcriptPath: fixture.transcriptPath,
      keyframesDir: fixture.keyframesDir,
      videoPath: fixture.videoPath,
      extractedJson: fixture.extractedJson,
      extractorVersion: fixture.extractorVersion,
      draftRecipeId: null,
    });
    // Patch the paths so they match PRD-110's `<source_id>/<filename>` layout.
    db.update(ingestSources)
      .set(prefixedPaths(row.id, fixture))
      .where(eq(ingestSources.id, row.id))
      .run();
    ctx.ingestSourceIdByRecipeSlug.set(fixture.recipeSlug, row.id);
  }
  return INGEST_SOURCE_FIXTURES.length;
}

/**
 * Patch every seeded ingest_sources row's `draft_recipe_id` to point at the
 * recipe that was drafted from it. Throws if a fixture names a recipe slug
 * that `seedRecipeHeaders` didn't create — protects against drift between
 * the two fixture sets.
 */
export function linkIngestSourcesToDrafts(db: FoodDb, ctx: SeedContext): void {
  for (const fixture of INGEST_SOURCE_FIXTURES) {
    const sourceId = ctx.ingestSourceIdByRecipeSlug.get(fixture.recipeSlug);
    if (sourceId === undefined) {
      throw new Error(
        `Ingest-source fixture for recipe "${fixture.recipeSlug}" was never inserted ` +
          `(seedIngestSources must run before linkIngestSourcesToDrafts).`
      );
    }
    const recipeId = ctx.recipeIdBySlug.get(fixture.recipeSlug);
    if (recipeId === undefined) {
      throw new Error(
        `Ingest-source fixture references recipe "${fixture.recipeSlug}" which ` +
          `was not seeded by seedRecipeHeaders.`
      );
    }
    linkDraftRecipe(db, sourceId, recipeId);
  }
}
