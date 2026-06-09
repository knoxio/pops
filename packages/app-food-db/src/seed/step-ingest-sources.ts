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
 * The two-pass shape matches how the worker (PRD-126) actually behaves:
 * insert the source row first (so failures still leave provenance behind),
 * extract → draft a recipe, then link back.
 *
 * Inserts go through the `createIngestSource` service so the kind/url
 * invariant and CHECK enforcement get exercised at seed time too.
 */
import { createIngestSource, linkDraftRecipe } from '../services/ingest-sources.js';
import { INGEST_SOURCE_FIXTURES } from './data-ingest-sources.js';

import type { FoodDb } from '../services/internal.js';
import type { SeedContext } from './types.js';

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
