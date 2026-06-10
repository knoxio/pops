/**
 * PRD-116 amendment test — `listCreationsForVersion` returns the slug
 * registrations that fall inside the configurable window ending at
 * `recipe_versions.compiled_at`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { recipes, recipeVersions } from '../schema.js';
import {
  countCreationsForVersion,
  DEFAULT_CREATION_WINDOW_SECONDS,
  listCreationsForVersion,
} from '../services/creations.js';
import { type FoodDb } from '../services/internal.js';

const MIGRATIONS = [
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
].map((name) =>
  readFileSync(join(__dirname, '../../../../apps/pops-api/src/db/drizzle-migrations', name), 'utf8')
);

function freshDb(): { db: FoodDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    const stmts = migration.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  return { db: drizzle(raw), raw };
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

describe('PRD-116 amendment — listCreationsForVersion', () => {
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
});
