/**
 * Integration test — exercises `gatherQualityInputsForVersions` against an
 * in-memory SQLite seeded with the food migration stack. Confirms the
 * batched JOINs return one row per input versionId with the correct shape,
 * derive `partialReason` from `extracted_json`, count creation slugs via the
 * window join, and collapse to a sensible default when the source row is
 * missing. Spec: pillars/food/docs/prds/quality-heuristic.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import { ingestSources, recipes, recipeVersions, slugRegistry } from '../../db/schema.js';
import { type FoodDb } from '../../db/services/internal.js';
import { gatherQualityInputsForVersions } from '../gather-quality-inputs.js';
import { scoreDraft } from '../quality.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

interface SeededRecipe {
  recipeId: number;
  versionId: number;
}

interface SeedVersionInput {
  title?: string;
  yieldQty?: number | null;
  compileStatus?: 'uncompiled' | 'compiled' | 'failed';
  compileError?: string | null;
  compiledAt?: string | null;
  sourceId?: number | null;
}

function seedRecipeAndVersion(db: FoodDb, slug: string, input: SeedVersionInput): SeededRecipe {
  const recipe = db
    .insert(recipes)
    .values({ slug, recipeType: 'plate' })
    .returning({ id: recipes.id })
    .all()[0];
  if (recipe === undefined) throw new Error('seed: insert recipe failed');
  const version = db
    .insert(recipeVersions)
    .values({
      recipeId: recipe.id,
      versionNo: 1,
      status: 'draft',
      title: input.title ?? 'Untitled',
      bodyDsl: '@recipe(slug="x", title="y")',
      yieldQty: input.yieldQty ?? null,
      compileStatus: input.compileStatus ?? 'uncompiled',
      compileError: input.compileError ?? null,
      compiledAt: input.compiledAt ?? null,
      sourceId: input.sourceId ?? null,
    })
    .returning({ id: recipeVersions.id })
    .all()[0];
  if (version === undefined) throw new Error('seed: insert version failed');
  return { recipeId: recipe.id, versionId: version.id };
}

interface SeedSourceInput {
  kind?: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  extractedJson?: string | null;
  draftRecipeId?: number | null;
  errorCode?: string | null;
  ingestedAt?: string;
}

function seedIngestSource(db: FoodDb, input: SeedSourceInput): number {
  const row = db
    .insert(ingestSources)
    .values({
      kind: input.kind ?? 'url-web',
      url: 'https://example.test/recipe',
      extractorVersion: 'test-1',
      extractedJson: input.extractedJson ?? null,
      draftRecipeId: input.draftRecipeId ?? null,
      errorCode: input.errorCode ?? null,
      ingestedAt: input.ingestedAt ?? '2026-06-09 12:00:00',
    })
    .returning({ id: ingestSources.id })
    .all()[0];
  if (row === undefined) throw new Error('seed: insert ingest_source failed');
  return row.id;
}

function seedSlugRegistry(
  raw: Database.Database,
  args: {
    slug: string;
    kind: 'ingredient' | 'recipe' | 'prep_state';
    targetId: number;
    createdAt: string;
  }
): void {
  // Bypass drizzle so we can stamp an explicit `created_at` (the SQL default
  // is `datetime('now')` which races with the window check otherwise).
  raw
    .prepare(`INSERT INTO slug_registry (slug, kind, target_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(args.slug, args.kind, args.targetId, args.createdAt);
}

/** Minimum ingredient columns to satisfy the FK on recipe_lines. */
function seedIngredient(raw: Database.Database, slug: string): number {
  const row = raw
    .prepare(
      `INSERT INTO ingredients (slug, name, default_unit) VALUES (?, ?, 'count') RETURNING id`
    )
    .get(slug, slug) as { id: number };
  raw
    .prepare(`INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'ingredient', ?)`)
    .run(slug, row.id);
  return row.id;
}

function insertLines(
  raw: Database.Database,
  versionId: number,
  ingredientId: number,
  n: number
): void {
  const stmt = raw.prepare(
    `INSERT INTO recipe_lines
      (recipe_version_id, position, ingredient_id, original_text, original_qty, original_unit, qty_count, canonical_unit)
     VALUES (?, ?, ?, 'test', 1, 'count', 1, 'count')`
  );
  for (let i = 0; i < n; i += 1) stmt.run(versionId, i + 1, ingredientId);
}

function insertSteps(raw: Database.Database, versionId: number, n: number): void {
  const stmt = raw.prepare(
    `INSERT INTO recipe_steps
      (recipe_version_id, position, body_md, body_resolved_json)
     VALUES (?, ?, 'mix', '{}')`
  );
  for (let i = 0; i < n; i += 1) stmt.run(versionId, i + 1);
}

const NOW = new Date('2026-06-10T12:00:00Z');

describe('gatherQualityInputsForVersions', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('returns an empty map for an empty input list', () => {
    expect(gatherQualityInputsForVersions(db, [])).toEqual(new Map());
  });

  it('produces a QualityInputs entry per known versionId; skips unknown ids', () => {
    const v = seedRecipeAndVersion(db, 'pancakes', {
      title: 'Banana pancakes',
      yieldQty: 4,
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 11:59:00',
    });
    const out = gatherQualityInputsForVersions(db, [v.versionId, 9999], NOW);
    expect(out.size).toBe(1);
    expect(out.get(v.versionId)).toBeDefined();
    expect(out.get(9999)).toBeUndefined();
  });

  it('reads compileStatus, hasTitle, hasYield from the version row', () => {
    const v = seedRecipeAndVersion(db, 'crepes', {
      title: 'Crepes',
      yieldQty: 6,
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 11:59:00',
    });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.compileStatus).toBe('compiled');
    expect(inputs?.hasTitle).toBe(true);
    expect(inputs?.hasYield).toBe(true);
  });

  it('parses compileErrorCount from the recipe_versions.compile_error JSON', () => {
    const errPayload = JSON.stringify({ errors: [{ code: 'E1' }, { code: 'E2' }, { code: 'E3' }] });
    const v = seedRecipeAndVersion(db, 'fail', {
      title: 'Fail',
      compileStatus: 'failed',
      compileError: errPayload,
    });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.compileErrorCount).toBe(3);
  });

  it('treats malformed compile_error JSON as 0 errors (defensive)', () => {
    const v = seedRecipeAndVersion(db, 'fail2', {
      compileStatus: 'failed',
      compileError: '{not valid json}',
    });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.compileErrorCount).toBe(0);
  });

  it('derives ingestKind + partialReason from the joined ingest_sources row', () => {
    const sourceId = seedIngestSource(db, {
      kind: 'url-instagram',
      extractedJson: JSON.stringify({ partialReason: 'vision-failed' }),
      draftRecipeId: null,
    });
    const v = seedRecipeAndVersion(db, 'reel', {
      title: 'IG reel',
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 11:59:00',
      sourceId,
    });
    // The draft_recipe_id has to be set so partial vs completed differs; do
    // that with a second UPDATE so the recipe row already exists.
    raw
      .prepare(`UPDATE ingest_sources SET draft_recipe_id = ? WHERE id = ?`)
      .run(v.recipeId, sourceId);
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.ingestKind).toBe('url-instagram');
    expect(inputs?.partialReason).toBe('vision-failed');
    expect(inputs?.ingestState).toBe('partial');
  });

  it('defaults to ingestKind="url-web" + state="processing" when no source row exists', () => {
    const v = seedRecipeAndVersion(db, 'manual', { title: 'Manual' });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.ingestKind).toBe('url-web');
    expect(inputs?.ingestState).toBe('processing');
    expect(inputs?.partialReason).toBeUndefined();
  });

  it('flips ingestState=failed when ingest_sources.error_code is populated', () => {
    const sourceId = seedIngestSource(db, {
      kind: 'text',
      errorCode: 'CompileFailed',
    });
    const v = seedRecipeAndVersion(db, 'broken', { sourceId });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.ingestState).toBe('failed');
  });

  it('counts the version creation_count via slug_registry window join', () => {
    const v = seedRecipeAndVersion(db, 'auto', {
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 12:00:00',
    });
    // Three slugs in the window (within 60s of compiled_at), one before it.
    seedSlugRegistry(raw, {
      slug: 'flour',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:59:30',
    });
    seedSlugRegistry(raw, {
      slug: 'sugar',
      kind: 'ingredient',
      targetId: 2,
      createdAt: '2026-06-10 11:59:45',
    });
    seedSlugRegistry(raw, {
      slug: 'butter',
      kind: 'ingredient',
      targetId: 3,
      createdAt: '2026-06-10 12:00:00',
    });
    // Outside the 60s window — should NOT count.
    seedSlugRegistry(raw, {
      slug: 'old',
      kind: 'ingredient',
      targetId: 99,
      createdAt: '2026-06-09 00:00:00',
    });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.creationCount).toBe(3);
  });

  it('counts ingredient_line_count + step_count via batched aggregates', () => {
    const v = seedRecipeAndVersion(db, 'recipe-with-lines', {
      title: 'X',
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 11:00:00',
    });
    const ingredientId = seedIngredient(raw, 'flour');
    insertLines(raw, v.versionId, ingredientId, 4);
    insertSteps(raw, v.versionId, 3);
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.ingredientLineCount).toBe(4);
    expect(inputs?.stepCount).toBe(3);
  });

  it('counts proposedSlugCount via the recipe_version_proposed_slugs aggregate', () => {
    const v = seedRecipeAndVersion(db, 'slugs', { compileStatus: 'compiled' });
    for (const slug of ['a', 'b', 'c', 'd', 'e']) {
      raw
        .prepare(
          `INSERT INTO recipe_version_proposed_slugs (recipe_version_id, slug, suggested_kind, from_loc_json) VALUES (?, ?, 'ingredient', '{}')`
        )
        .run(v.versionId, slug);
    }
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.proposedSlugCount).toBe(5);
  });

  it('computes ingestAgeMinutes correctly against the override "now"', () => {
    const sourceId = seedIngestSource(db, { ingestedAt: '2026-06-10 10:00:00' });
    const v = seedRecipeAndVersion(db, 'aged', { sourceId });
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs?.ingestAgeMinutes).toBe(120);
  });

  it('round-trip: gather → scoreDraft produces a sensible band on a clean draft', () => {
    const sourceId = seedIngestSource(db, {
      kind: 'text',
      ingestedAt: '2026-06-10 11:50:00',
    });
    const v = seedRecipeAndVersion(db, 'happy', {
      title: 'Happy path',
      yieldQty: 4,
      compileStatus: 'compiled',
      compiledAt: '2026-06-10 11:55:00',
      sourceId,
    });
    const ingredientId = seedIngredient(raw, 'flour-happy');
    insertLines(raw, v.versionId, ingredientId, 3);
    insertSteps(raw, v.versionId, 3);
    const inputs = gatherQualityInputsForVersions(db, [v.versionId], NOW).get(v.versionId);
    expect(inputs).toBeDefined();
    const r = scoreDraft(inputs!);
    expect(r.band).toBe('clean');
  });

  it('handles multiple versions in a single call without N+1 (smoke check)', () => {
    const v1 = seedRecipeAndVersion(db, 'v1', { title: 'one' });
    const v2 = seedRecipeAndVersion(db, 'v2', { title: 'two' });
    const v3 = seedRecipeAndVersion(db, 'v3', { title: 'three' });
    const map = gatherQualityInputsForVersions(db, [v1.versionId, v2.versionId, v3.versionId], NOW);
    expect(map.size).toBe(3);
    expect(map.get(v1.versionId)?.hasTitle).toBe(true);
    expect(map.get(v2.versionId)?.hasTitle).toBe(true);
    expect(map.get(v3.versionId)?.hasTitle).toBe(true);
  });
});

describe('schema sanity', () => {
  it('migrations apply cleanly + slug_registry is empty by default', () => {
    const { db } = freshDb();
    const rows = db.select().from(slugRegistry).all();
    expect(rows).toEqual([]);
  });
});
