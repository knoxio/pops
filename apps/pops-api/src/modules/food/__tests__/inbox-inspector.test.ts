/**
 * PRD-135 — integration tests for `food.inbox.getForReview`.
 *
 * In-memory SQLite seeded with the food migration subset + the same inline
 * `ai_inference_log` table PRD-138's test uses (the canonical 0034 migration
 * drags in earlier finance plumbing this PRD doesn't need).
 *
 * Coverage:
 *   - returns `{ ok: false, reason: 'SourceNotFound' }` for an unknown sourceId
 *   - returns the source-only view (draft = null) for an ingest source with
 *     no linked draft (the pending / failed paths)
 *   - returns the full review view for each ingest kind, with the rejection
 *     row when archived and the quality breakdown when compiled
 *   - aggregates `ai_inference_log.cost_usd` for the source via the
 *     `context_id = 'ingest_source:' || sourceId` namespaced lookup
 *   - includes the auto-create banner rows (creations enriched with parent
 *     ingredient slug + default unit) when the draft compiled with new slugs
 *   - state derivation: `failed` when `error_code` is set, `partial` when
 *     `partialReason` lives in `extracted_json`, `completed` otherwise
 *   - input validation rejects non-positive sourceId via Zod
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ingestSourcesService,
  ingredientsService,
  recipesService,
  variantsService,
} from '@pops/app-food-db';
import { ingestSources, recipeVersions } from '@pops/food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
  '0067_prd_125_ingest_error_columns.sql',
  '0068_prd_136_inbox_review.sql',
  '0069_prd_145_batches_deleted_at.sql',
  '0070_prd_151_ingredient_tags.sql',
];

const AI_INFERENCE_LOG_INLINE_DDL = `
  CREATE TABLE ai_inference_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'claude',
    model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    operation TEXT NOT NULL DEFAULT 'recipe-extract',
    domain TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    cached INTEGER NOT NULL DEFAULT 0,
    context_id TEXT,
    error_message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

function applyMigration(db: Database, filename: string): void {
  const text = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of text.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  db.exec(AI_INFERENCE_LOG_INLINE_DDL);
  return db;
}

interface SeededDraft {
  sourceId: number;
  draftVersionId: number;
  recipeId: number;
  recipeSlug: string;
}

function seedCompiledDraft(opts: {
  slug: string;
  kind?: 'text' | 'url-web' | 'url-instagram' | 'screenshot';
  url?: string | null;
  extractedJson?: string | null;
}): SeededDraft {
  const db = getDrizzle();
  const kind = opts.kind ?? 'text';
  const source = ingestSourcesService.createIngestSource(db, {
    kind,
    extractorVersion: 'test-v1',
    url: opts.url ?? null,
  });
  if (opts.extractedJson !== undefined) {
    db.update(ingestSources)
      .set({ extractedJson: opts.extractedJson })
      .where(eq(ingestSources.id, source.id))
      .run();
  }
  const banana = ingredientsService.createIngredient(db, {
    slug: `${opts.slug}-banana`,
    name: 'Banana',
    defaultUnit: 'count',
  });
  variantsService.createVariant(db, {
    ingredientId: banana.id,
    slug: 'raw',
    name: 'Raw',
    defaultUnit: 'count',
  });
  const recipe = recipesService.createRecipe(db, {
    slug: opts.slug,
    firstVersion: {
      title: `Test ${opts.slug}`,
      bodyDsl: `@recipe(slug="${opts.slug}", title="Test ${opts.slug}")`,
      sourceId: source.id,
    },
  });
  // PRD-125's `workerComplete` writes both `recipe_versions.source_id` AND
  // `ingest_sources.draft_recipe_id`. The seed mirrors the second leg here
  // so the inspector's state derivation (`draft_recipe_id IS NOT NULL ->
  // completed/partial`) matches the production wire-up.
  ingestSourcesService.linkDraftRecipe(db, source.id, recipe.recipe.id);
  db.run(
    sql`UPDATE recipe_versions SET compile_status = 'compiled', compiled_at = datetime('now') WHERE id = ${recipe.version.id}`
  );
  return {
    sourceId: source.id,
    draftVersionId: recipe.version.id,
    recipeId: recipe.recipe.id,
    recipeSlug: opts.slug,
  };
}

describe('food.inbox.getForReview — PRD-135', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it('returns SourceNotFound for an unknown sourceId', async () => {
    const result = await caller.food.inbox.getForReview({ sourceId: 99_999 });
    expect(result).toEqual({ ok: false, reason: 'SourceNotFound' });
  });

  it('returns the full review for a compiled url-web draft', async () => {
    const seed = seedCompiledDraft({
      slug: 'web-recipe',
      kind: 'url-web',
      url: 'https://x.test/r',
    });
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.source.id).toBe(seed.sourceId);
    expect(result.review.source.kind).toBe('url-web');
    expect(result.review.source.url).toBe('https://x.test/r');
    expect(result.review.source.state).toBe('completed');
    expect(result.review.source.inferenceLogs).toEqual([]);
    expect(result.review.source.totalCostUsd).toBe(0);
    expect(result.review.draft).not.toBeNull();
    if (result.review.draft === null) return;
    expect(result.review.draft.recipeSlug).toBe('web-recipe');
    expect(result.review.draft.versionId).toBe(seed.draftVersionId);
    expect(result.review.draft.compileStatus).toBe('compiled');
    expect(result.review.draft.proposedSlugs).toEqual([]);
    expect(result.review.draft.rejection).toBeNull();
    expect(result.review.draft.title).toBe('Test web-recipe');
    expect(result.review.draft.bodyDsl).toContain('@recipe(slug="web-recipe"');
    expect(result.review.draft.quality.band).toBeDefined();
    expect(result.review.draft.quality.score).toBeGreaterThanOrEqual(0);
  });

  it('returns draft=null for a source without a draft', async () => {
    const db = getDrizzle();
    const source = ingestSourcesService.createIngestSource(db, {
      kind: 'text',
      extractorVersion: 'test-v1',
      url: null,
    });
    const result = await caller.food.inbox.getForReview({ sourceId: source.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.draft).toBeNull();
    expect(result.review.source.state).toBe('processing');
  });

  it('marks state=failed when error_code is set on the source', async () => {
    const db = getDrizzle();
    const source = ingestSourcesService.createIngestSource(db, {
      kind: 'url-web',
      extractorVersion: 'test-v1',
      url: 'https://x.test/broken',
    });
    db.update(ingestSources)
      .set({ errorCode: 'FetchFailed', errorMessage: 'connection refused', attempts: 2 })
      .where(eq(ingestSources.id, source.id))
      .run();
    const result = await caller.food.inbox.getForReview({ sourceId: source.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.source.state).toBe('failed');
    expect(result.review.source.errorCode).toBe('FetchFailed');
    expect(result.review.source.errorMessage).toBe('connection refused');
    expect(result.review.source.attempts).toBe(2);
  });

  it('marks state=partial when extracted_json carries a partialReason', async () => {
    const seed = seedCompiledDraft({
      slug: 'ig-partial',
      kind: 'url-instagram',
      url: 'https://instagram.com/p/abc',
      extractedJson: JSON.stringify({
        extractor_version: 'ig-v1',
        stages: {},
        partialReason: 'auth-dead',
      }),
    });
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.source.state).toBe('partial');
    expect(result.review.source.partialReason).toBe('auth-dead');
  });

  it('aggregates ai_inference_log cost via the namespaced context_id', async () => {
    const seed = seedCompiledDraft({ slug: 'cost-test', kind: 'text' });
    sqlite
      .prepare(
        `INSERT INTO ai_inference_log (operation, cost_usd, context_id, created_at) ` +
          `VALUES (?, ?, ?, ?)`
      )
      .run('recipe-extract-text', 0.025, `ingest_source:${seed.sourceId}`, '2026-06-10 12:00:00');
    sqlite
      .prepare(
        `INSERT INTO ai_inference_log (operation, cost_usd, context_id, created_at) ` +
          `VALUES (?, ?, ?, ?)`
      )
      .run('recipe-extract-text', 0.015, `ingest_source:${seed.sourceId}`, '2026-06-10 12:00:05');
    // Sibling row for a different source must not affect the rollup.
    sqlite
      .prepare(
        `INSERT INTO ai_inference_log (operation, cost_usd, context_id, created_at) ` +
          `VALUES (?, ?, ?, ?)`
      )
      .run('recipe-extract-text', 1.0, 'ingest_source:99999', '2026-06-10 12:00:00');
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.source.inferenceLogs).toHaveLength(2);
    expect(result.review.source.totalCostUsd).toBeCloseTo(0.04, 5);
  });

  it('includes the rejection row when the version is archived via inbox.reject', async () => {
    const seed = seedCompiledDraft({ slug: 'reject-me' });
    await caller.food.inbox.reject({
      versionId: seed.draftVersionId,
      reason: 'duplicate',
      note: 'matches an existing recipe',
    });
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.draft).not.toBeNull();
    expect(result.review.draft?.status).toBe('archived');
    expect(result.review.draft?.rejection).toMatchObject({
      reason: 'duplicate',
      note: 'matches an existing recipe',
    });
  });

  it('enriches creations with parent ingredient slug + default unit', async () => {
    const db = getDrizzle();
    const seed = seedCompiledDraft({ slug: 'creations-test' });
    // Inject a fresh ingredient + variant timed inside the creations window so
    // listCreationsForVersion picks them up. The seedCompiledDraft helper
    // already wrote a `creations-test-banana` ingredient + `raw` variant
    // alongside the seed call; reuse the variant for the assertion (it's
    // scoped under the parent ingredient slug we just inserted).
    // Force compiledAt to the future-edge of the window so both timestamps fall inside.
    db.run(
      sql`UPDATE recipe_versions SET compiled_at = datetime('now') WHERE id = ${seed.draftVersionId}`
    );
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const creations = result.review.draft?.creations ?? [];
    const ingredientCreation = creations.find((c) => c.kind === 'ingredient');
    const variantCreation = creations.find((c) => c.kind === 'variant');
    expect(ingredientCreation?.slug).toBe('creations-test-banana');
    expect(ingredientCreation?.parentIngredientSlug).toBeNull();
    expect(ingredientCreation?.defaultUnit).toBe('count');
    expect(variantCreation?.slug).toBe('raw');
    expect(variantCreation?.parentIngredientSlug).toBe('creations-test-banana');
    expect(variantCreation?.defaultUnit).toBe('count');
  });

  it('parses compile_error JSON into the structured envelope', async () => {
    const db = getDrizzle();
    const seed = seedCompiledDraft({ slug: 'compile-fail' });
    db.update(recipeVersions)
      .set({
        compileStatus: 'failed',
        compileError: JSON.stringify({
          phase: 'resolve',
          errors: [
            {
              code: 'UnknownSlug',
              message: 'apple is not known',
              loc: { startLine: 2, startCol: 1, endLine: 2, endCol: 6 },
            },
          ],
          proposedSlugsCount: 1,
        }),
      })
      .where(eq(recipeVersions.id, seed.draftVersionId))
      .run();
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.draft?.compileStatus).toBe('failed');
    expect(result.review.draft?.compileError?.phase).toBe('resolve');
    expect(result.review.draft?.compileError?.errors).toHaveLength(1);
    expect(result.review.draft?.compileError?.errors[0]?.code).toBe('UnknownSlug');
    expect(result.review.draft?.compileError?.errors[0]?.loc).toEqual({
      startLine: 2,
      startCol: 1,
      endLine: 2,
      endCol: 6,
    });
  });

  it('rejects non-positive sourceId via Zod', async () => {
    await expect(caller.food.inbox.getForReview({ sourceId: 0 })).rejects.toThrow();
    await expect(caller.food.inbox.getForReview({ sourceId: -1 })).rejects.toThrow();
  });

  // Copilot R1: malformed `from_loc_json` must not crash the whole inspector
  // read. Mirrors the resilience pattern used by `parseExtractedMeta` +
  // `parseCompileErrorJson` elsewhere in the service.
  it('survives a malformed recipe_version_proposed_slugs.from_loc_json row', async () => {
    const seed = seedCompiledDraft({ slug: 'bad-loc' });
    sqlite
      .prepare(
        `INSERT INTO recipe_version_proposed_slugs ` +
          `(recipe_version_id, slug, suggested_kind, from_loc_json) ` +
          `VALUES (?, ?, ?, ?)`
      )
      .run(seed.draftVersionId, 'broken-slug', 'ingredient', '{not valid json');
    const result = await caller.food.inbox.getForReview({ sourceId: seed.sourceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slugs = result.review.draft?.proposedSlugs ?? [];
    const broken = slugs.find((s) => s.slug === 'broken-slug');
    expect(broken).toBeDefined();
    expect(broken?.fromLoc).toMatchObject({
      startLine: 1,
      startCol: 1,
      endLine: 1,
      endCol: 1,
    });
  });
});
