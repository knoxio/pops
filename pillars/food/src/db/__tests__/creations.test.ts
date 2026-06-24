/**
 * `listCreationsForVersion` returns the slug registrations that fall inside
 * the configurable window ending at `recipe_versions.compiled_at`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../open-food-db.js';
import { recipes, recipeVersions } from '../schema.js';
import {
  countCreationsForVersion,
  countCreationsForVersions,
  DEFAULT_CREATION_WINDOW_SECONDS,
  listCreationsForVersion,
} from '../services/creations.js';
import { type FoodDb } from '../services/internal.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

interface SeedVersionArgs {
  compiledAt: string | null;
  compileStatus?: 'uncompiled' | 'compiled' | 'failed';
}

function seedVersion(db: FoodDb, slug: string, args: SeedVersionArgs): number {
  const recipe = db
    .insert(recipes)
    .values({ slug, recipeType: 'plate' })
    .returning({ id: recipes.id })
    .all()[0];
  if (recipe === undefined) throw new Error('seed: recipe insert failed');
  const v = db
    .insert(recipeVersions)
    .values({
      recipeId: recipe.id,
      versionNo: 1,
      status: 'draft',
      title: 'Test',
      bodyDsl: '@recipe(slug="x", title="y")',
      compileStatus: args.compileStatus ?? 'compiled',
      compiledAt: args.compiledAt,
    })
    .returning({ id: recipeVersions.id })
    .all()[0];
  if (v === undefined) throw new Error('seed: version insert failed');
  return v.id;
}

function insertSlugRegistry(
  raw: Database.Database,
  args: {
    slug: string;
    kind: 'ingredient' | 'recipe' | 'prep_state';
    targetId: number;
    createdAt: string;
  }
): void {
  raw
    .prepare(`INSERT INTO slug_registry (slug, kind, target_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(args.slug, args.kind, args.targetId, args.createdAt);
}

describe('listCreationsForVersion', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  it('returns an empty array when the version has no compiled_at', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: null, compileStatus: 'uncompiled' });
    expect(listCreationsForVersion(db, versionId)).toEqual([]);
    expect(countCreationsForVersion(db, versionId)).toBe(0);
  });

  it('returns an empty array when the version does not exist', () => {
    expect(listCreationsForVersion(db, 9999)).toEqual([]);
  });

  it('returns only ingredient + recipe slugs from inside the window (default 60s)', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: '2026-06-10 12:00:00' });
    // Inside the window:
    insertSlugRegistry(raw, {
      slug: 'flour',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:59:30',
    });
    insertSlugRegistry(raw, {
      slug: 'pancakes',
      kind: 'recipe',
      targetId: 1,
      createdAt: '2026-06-10 12:00:00',
    });
    // Outside the window — should NOT count:
    insertSlugRegistry(raw, {
      slug: 'old',
      kind: 'ingredient',
      targetId: 2,
      createdAt: '2026-06-10 11:58:00',
    });
    // prep_state — excluded by kind:
    insertSlugRegistry(raw, {
      slug: 'chopped',
      kind: 'prep_state',
      targetId: 3,
      createdAt: '2026-06-10 11:59:50',
    });
    const rows = listCreationsForVersion(db, versionId);
    expect(rows.map((r) => r.slug).toSorted()).toEqual(['flour', 'pancakes']);
    expect(countCreationsForVersion(db, versionId)).toBe(2);
  });

  it('honours a custom windowSeconds override', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: '2026-06-10 12:00:00' });
    insertSlugRegistry(raw, {
      slug: 'old-but-included',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:50:00', // 10 min before
    });
    // Default 60s window would skip the row; 600s should include it.
    expect(countCreationsForVersion(db, versionId)).toBe(0);
    expect(countCreationsForVersion(db, versionId, { windowSeconds: 600 })).toBe(1);
  });

  it('returns rows exactly equal to compiled_at (inclusive upper bound)', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: '2026-06-10 12:00:00' });
    insertSlugRegistry(raw, {
      slug: 'tight',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 12:00:00',
    });
    expect(listCreationsForVersion(db, versionId)).toHaveLength(1);
  });

  it('excludes rows registered AFTER compiled_at (window upper bound is inclusive)', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: '2026-06-10 12:00:00' });
    insertSlugRegistry(raw, {
      slug: 'after',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 12:00:01',
    });
    expect(listCreationsForVersion(db, versionId)).toHaveLength(0);
  });

  it('returns the createdAt on each row so callers can audit ordering', () => {
    const versionId = seedVersion(db, 'v', { compiledAt: '2026-06-10 12:00:00' });
    insertSlugRegistry(raw, {
      slug: 'one',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:59:01',
    });
    insertSlugRegistry(raw, {
      slug: 'two',
      kind: 'ingredient',
      targetId: 2,
      createdAt: '2026-06-10 11:59:30',
    });
    const rows = listCreationsForVersion(db, versionId);
    for (const row of rows) {
      expect(row.createdAt).toMatch(/^2026-06-10 11:59/);
    }
  });

  it('default window matches the exported constant (60s)', () => {
    expect(DEFAULT_CREATION_WINDOW_SECONDS).toBe(60);
  });

  it('handles the production-shape compiled_at (ISO `T...Z` from new Date().toISOString())', () => {
    // The compile writer stamps recipe_versions.compiled_at with
    // `new Date().toISOString()` — `2026-06-10T12:00:00.000Z`, NOT the
    // SQLite `YYYY-MM-DD HH:MM:SS` shape. Naive string comparison would
    // place slugs registered after the compile inside the window (`' '`
    // sorts before `'T'`). The helper normalises both bounds to the
    // SQLite shape so the comparison is correct.
    const versionId = seedVersion(db, 'iso', { compiledAt: '2026-06-10T12:00:00.000Z' });
    insertSlugRegistry(raw, {
      slug: 'inside',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:59:30',
    });
    insertSlugRegistry(raw, {
      slug: 'after-the-compile',
      kind: 'ingredient',
      targetId: 2,
      createdAt: '2026-06-10 12:00:30', // 30s AFTER compile — must be excluded
    });
    const slugs = listCreationsForVersion(db, versionId).map((r) => r.slug);
    expect(slugs).toEqual(['inside']);
  });

  it('includes ingredient_variants created in the window (variants are not in slug_registry)', () => {
    const versionId = seedVersion(db, 'with-variant', { compiledAt: '2026-06-10 12:00:00' });
    // Seed a parent ingredient first so the variant FK is satisfied.
    const parentId = (
      raw
        .prepare(
          `INSERT INTO ingredients (slug, name, default_unit) VALUES ('flour-parent', 'Flour parent', 'g') RETURNING id`
        )
        .get() as { id: number }
    ).id;
    // Inside the window — variant counts.
    raw
      .prepare(
        `INSERT INTO ingredient_variants (ingredient_id, slug, name, default_unit, created_at) VALUES (?, ?, ?, 'g', ?)`
      )
      .run(parentId, 'flour-bread', 'Bread flour', '2026-06-10 11:59:50');
    // Outside the window — variant excluded.
    raw
      .prepare(
        `INSERT INTO ingredient_variants (ingredient_id, slug, name, default_unit, created_at) VALUES (?, ?, ?, 'g', ?)`
      )
      .run(parentId, 'flour-old', 'Old flour', '2026-06-10 11:50:00');
    const rows = listCreationsForVersion(db, versionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('variant');
    expect(rows[0]?.slug).toBe('flour-bread');
  });

  it('countCreationsForVersions batches across the input ids in a single window scan', () => {
    const a = seedVersion(db, 'a', { compiledAt: '2026-06-10 12:00:00' });
    const b = seedVersion(db, 'b', { compiledAt: '2026-06-10 12:00:00' });
    const noCompile = seedVersion(db, 'never', {
      compiledAt: null,
      compileStatus: 'uncompiled',
    });
    insertSlugRegistry(raw, {
      slug: 's1',
      kind: 'ingredient',
      targetId: 1,
      createdAt: '2026-06-10 11:59:30',
    });
    insertSlugRegistry(raw, {
      slug: 's2',
      kind: 'recipe',
      targetId: 1,
      createdAt: '2026-06-10 11:59:45',
    });
    const out = countCreationsForVersions(db, [a, b, noCompile]);
    // Both compiled versions share the window — each sees 2 creations.
    // The never-compiled version is absent from the map (callers default to 0).
    expect(out.get(a)).toBe(2);
    expect(out.get(b)).toBe(2);
    expect(out.get(noCompile)).toBeUndefined();
  });

  it('countCreationsForVersions returns an empty map for an empty input list', () => {
    expect(countCreationsForVersions(db, [])).toEqual(new Map());
  });
});
