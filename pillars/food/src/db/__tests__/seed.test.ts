/**
 * PRD-113 phase-1 + phase-3 seed tests.
 *
 * Applies every food + lists migration to an in-memory SQLite, runs
 * `seedFood`, then asserts:
 *
 *   - the returned summary counts match expected per-table volumes
 *   - the slug_registry holds an entry for every ingredient/recipe/prep-state
 *   - the depth-cap (≤ 2 in fixtures, ≤ 3 in DB) is respected
 *   - every PRD-109 context tag declared in the theme README success
 *     criterion #4 is covered by at least one seeded substitution
 *   - batches mix NULL `expires_at` (shelf-stable) and explicit expiry rows
 *   - plan_entries mix slotted and ad-hoc (the prep-session entries)
 *   - phase-3 ingest_sources rows are linked both ways (recipe_versions
 *     .source_id and ingest_sources.draft_recipe_id), covering both url-web
 *     and url-instagram kinds
 *   - re-running seedFood is a no-op (skipped + zero counts)
 *
 * No Redis, no API process — pure schema + service exercise.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedFood, type SeedFoodSummary } from '../../seed/index.js';
import {
  batches,
  ingestSources,
  planEntries,
  recipeRuns,
  recipeVersions,
  slugRegistry,
  substitutions,
} from '../schema.js';

import type { FoodDb } from '../services/internal.js';

const MIGRATIONS = [
  '0058_high_sentinel.sql', // PRD-106 ingredients + slug_registry + prep_states + aliases
  '0059_useful_hiroim.sql', // PRD-107 recipes + recipe_versions + recipe_tags
  '0060_familiar_leo.sql', // PRD-108 batches + recipe_runs + batch_consumptions
  '0061_shocking_skreet.sql', // PRD-109 substitutions
  '0062_chemical_donald_blake.sql', // PRD-112 lists + list_items
  '0063_bumpy_wolverine.sql', // PRD-111 plan_slots + plan_entries
  '0064_peaceful_magma.sql', // PRD-110 ingest_sources
  '0065_prd_116_recipe_compile.sql', // PRD-116 recipe_lines + recipe_steps + proposed_slugs
  '0066_prd_123_conversions.sql', // PRD-123 unit_conversions + ingredient_weights
  '0067_prd_125_ingest_error_columns.sql', // PRD-125 error_code/message/attempts on ingest_sources
  '0068_prd_136_inbox_review.sql', // PRD-136 recipe_version_rejections + ingest_sources.reviewed_at
  '0069_prd_145_batches_deleted_at.sql', // PRD-145 batches.deleted_at soft-delete column
  '0070_prd_151_ingredient_tags.sql', // PRD-151 ingredient_tags + namespace expression index
].map((name) =>
  readFileSync(
    join(__dirname, '../../../../../apps/pops-api/src/db/drizzle-migrations', name),
    'utf8'
  )
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

describe('PRD-113 phase-1 seed', () => {
  let db: FoodDb;
  let raw: Database.Database;
  let summary: SeedFoodSummary;

  beforeEach(() => {
    ({ db, raw } = freshDb());
    summary = seedFood(db);
  });

  describe('summary counts', () => {
    it('seeds the canonical 15 prep_states (PRD-106)', () => {
      expect(summary.prepStates).toBe(15);
    });
    it('seeds at least 20 ingredients (PRD-113 spec)', () => {
      expect(summary.ingredients).toBeGreaterThanOrEqual(20);
    });
    it('seeds at least 30 aliases (PRD-113 spec)', () => {
      expect(summary.aliases).toBeGreaterThanOrEqual(30);
    });
    it('seeds at least 5 recipes (smash-patty + smash-burger + pasta + roast + eggs)', () => {
      expect(summary.recipes).toBeGreaterThanOrEqual(5);
      expect(summary.recipeVersions).toBe(summary.recipes);
    });
    it('seeds PRD-123 conversion fixtures (unit_conversions + ingredient_weights)', () => {
      expect(summary.unitConversions).toBeGreaterThanOrEqual(10);
      expect(summary.ingredientWeights).toBeGreaterThanOrEqual(4);
    });
    it('seeds 10 batches and 1 cook run with consumptions', () => {
      expect(summary.batches).toBe(10);
      expect(summary.recipeRuns).toBe(1);
      expect(summary.batchConsumptions).toBeGreaterThan(0);
    });
    it('seeds plan slots including the user-added "late-night" slot', () => {
      expect(summary.planSlots).toBe(6);
    });
    it('seeds the two phase-3 ingest_sources fixtures', () => {
      expect(summary.ingestSources).toBe(2);
    });
    it('seeds at least 4 store-section tags (PRD-151)', () => {
      // produce, dairy, meat, pantry — the 4 sections with seeded ingredients.
      expect(summary.ingredientTags).toBeGreaterThanOrEqual(4);
    });
  });

  describe('ingredient_tags (PRD-151)', () => {
    it('seeds the four store-sections that have seeded ingredients', () => {
      const sections = raw
        .prepare(
          `SELECT DISTINCT tag FROM ingredient_tags WHERE tag LIKE 'store-section:%' ORDER BY tag`
        )
        .all() as { tag: string }[];
      const values = sections.map((s) => s.tag);
      expect(values).toEqual(
        expect.arrayContaining([
          'store-section:dairy',
          'store-section:meat',
          'store-section:pantry',
          'store-section:produce',
        ])
      );
    });

    it('does not seed sections without seeded ingredients (frozen, condiments, beverages)', () => {
      const empties = raw
        .prepare(
          `SELECT DISTINCT tag FROM ingredient_tags WHERE tag IN ('store-section:frozen', 'store-section:condiments', 'store-section:beverages')`
        )
        .all() as { tag: string }[];
      expect(empties).toEqual([]);
    });
  });

  describe('ingest_sources (phase 3)', () => {
    it('inserts both fixture kinds (url-instagram + url-web)', () => {
      const kinds = db
        .select({ kind: ingestSources.kind })
        .from(ingestSources)
        .all()
        .map((row) => row.kind)
        .toSorted();
      expect(kinds).toEqual(['url-instagram', 'url-web']);
    });

    it('links every ingest_sources row back to a seeded recipe', () => {
      const orphans = db
        .select({ n: sql<number>`count(*)` })
        .from(ingestSources)
        .where(isNull(ingestSources.draftRecipeId))
        .all();
      expect(orphans[0]?.n ?? 0).toBe(0);
    });

    it('wires recipe_versions.source_id for ingest-originated drafts', () => {
      // PRD-135's inbox-inspector scope is `recipe_versions.source_id IS NOT NULL`.
      const linked = db
        .select({ n: sql<number>`count(*)` })
        .from(recipeVersions)
        .where(isNotNull(recipeVersions.sourceId))
        .all();
      expect(linked[0]?.n ?? 0).toBe(2);
    });

    it('manually-authored recipes leave source_id NULL', () => {
      // Assert by slug rather than by count so the test survives future
      // fixture growth (more ingest-sourced or more manual recipes both stay
      // green) while still checking the actual invariant: every
      // currently-manual recipe lands with source_id NULL.
      const MANUAL_SLUGS = ['roast-chicken', 'breakfast-eggs', 'smash-patty'] as const;
      const rows = raw
        .prepare(
          `SELECT r.slug, v.source_id
             FROM recipes r JOIN recipe_versions v ON v.recipe_id = r.id
             WHERE r.slug IN (${MANUAL_SLUGS.map(() => '?').join(',')})`
        )
        .all(...MANUAL_SLUGS) as { slug: string; source_id: number | null }[];
      // Every version for these manual recipes MUST have source_id NULL —
      // even if a future phase introduces additional versions.
      expect(rows.length).toBeGreaterThanOrEqual(MANUAL_SLUGS.length);
      for (const row of rows) {
        expect(row.source_id, `Manual recipe "${row.slug}" leaked a source_id`).toBeNull();
      }
    });

    it('round-trips draft_recipe_id ↔ recipe_versions.source_id symmetrically', () => {
      // For each ingest_sources row, the recipe it drafts (draft_recipe_id)
      // must have AT LEAST ONE recipe_version whose source_id points back at
      // the ingest_sources row. EXISTS semantics — robust to a recipe later
      // gaining additional versions that aren't ingest-sourced.
      const sourceRows = raw.prepare(`SELECT id, draft_recipe_id FROM ingest_sources`).all() as {
        id: number;
        draft_recipe_id: number | null;
      }[];
      expect(sourceRows.length).toBe(2);
      for (const source of sourceRows) {
        expect(source.draft_recipe_id).not.toBeNull();
        const matches = raw
          .prepare(
            `SELECT 1 FROM recipe_versions
               WHERE recipe_id = ? AND source_id = ? LIMIT 1`
          )
          .all(source.draft_recipe_id, source.id) as unknown[];
        expect(
          matches.length,
          `ingest_sources(${source.id}) has no matching recipe_versions.source_id for recipe ${source.draft_recipe_id}`
        ).toBe(1);
      }
    });

    it("stores media paths in PRD-110's `<source_id>/<filename>` layout", () => {
      // PRD-110 § Filesystem Layout — relative paths are prefixed with the
      // per-source subdir (e.g. `42/video.mp4`). Catches a regression where
      // a future change writes bare filenames.
      const rows = raw
        .prepare(`SELECT id, transcript_path, keyframes_dir, video_path FROM ingest_sources`)
        .all() as {
        id: number;
        transcript_path: string | null;
        keyframes_dir: string | null;
        video_path: string | null;
      }[];
      expect(rows.length).toBe(2);
      const assertPrefix = (column: string, id: number, value: string | null): void => {
        if (value === null) return; // url-web rows leave transcript/video null
        const expectedPrefix = `${id}/`;
        expect(
          value.startsWith(expectedPrefix),
          `ingest_sources(${id}).${column} = "${value}" does not start with "${expectedPrefix}"`
        ).toBe(true);
        // Defensive: the path beyond the prefix must be non-empty.
        expect(value.slice(expectedPrefix.length).length).toBeGreaterThan(0);
      };
      for (const row of rows) {
        assertPrefix('transcript_path', row.id, row.transcript_path);
        assertPrefix('keyframes_dir', row.id, row.keyframes_dir);
        assertPrefix('video_path', row.id, row.video_path);
      }
    });

    it('records extractor_version on every row', () => {
      const blanks = db
        .select({ extractor: ingestSources.extractorVersion })
        .from(ingestSources)
        .all()
        .filter((row) => row.extractor.trim().length === 0);
      expect(blanks.length).toBe(0);
    });

    it('only ingest-sourced recipes appear in the inbox-scope query', () => {
      // Replicates PRD-135's intended SELECT verbatim — drafts whose
      // recipe_versions.source_id IS NOT NULL.
      const inbox = raw
        .prepare(
          `SELECT r.slug FROM recipes r
             JOIN recipe_versions v ON v.recipe_id = r.id
             WHERE v.source_id IS NOT NULL
             ORDER BY r.slug`
        )
        .all() as { slug: string }[];
      expect(inbox.map((row) => row.slug)).toEqual(['smash-burger', 'weeknight-pasta']);
    });
  });

  describe('slug_registry coverage', () => {
    it('records a slug_registry entry per seeded ingredient', () => {
      const ingredientSlugs = db
        .select({ slug: slugRegistry.slug })
        .from(slugRegistry)
        .where(eq(slugRegistry.kind, 'ingredient'))
        .all();
      expect(ingredientSlugs.length).toBe(summary.ingredients);
    });
    it('records prep_state and recipe kinds too', () => {
      const counts = db
        .select({ kind: slugRegistry.kind, n: sql<number>`count(*)` })
        .from(slugRegistry)
        .groupBy(slugRegistry.kind)
        .all();
      const byKind = new Map(counts.map((r) => [r.kind, Number(r.n)]));
      expect(byKind.get('prep_state')).toBe(summary.prepStates);
      expect(byKind.get('recipe')).toBe(summary.recipes);
    });
  });

  describe('ingredient hierarchy', () => {
    it('respects depth ≤ 2 in fixtures (depth-3 cap is exercised separately)', () => {
      // Count ingredients with parent_id IS NOT NULL — they're the depth-2 children.
      const childRows = raw
        .prepare(`SELECT COUNT(*) AS n FROM ingredients WHERE parent_id IS NOT NULL`)
        .get() as { n: number };
      // Fixtures: tomato → roma + cherry, potato → desiree
      expect(childRows.n).toBe(3);
    });
    it('children FK back to a known parent', () => {
      const orphans = raw
        .prepare(
          `SELECT COUNT(*) AS n FROM ingredients c
             WHERE c.parent_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM ingredients p WHERE p.id = c.parent_id)`
        )
        .get() as { n: number };
      expect(orphans.n).toBe(0);
    });
  });

  describe('substitution context tag coverage (theme README criterion #4)', () => {
    const REQUIRED_TAGS = [
      'savory',
      'sweet',
      'baking',
      'frying',
      'dressing',
      'marinade',
      'garnish',
      'vegan',
      'dairy-free',
      'gluten-free',
    ] as const;

    it('at least one substitution per required context tag', () => {
      const allRows = db.select({ tags: substitutions.contextTags }).from(substitutions).all();
      const observed = new Set<string>();
      for (const row of allRows) {
        const parsed = JSON.parse(row.tags) as unknown;
        if (Array.isArray(parsed)) {
          for (const tag of parsed) {
            if (typeof tag === 'string') observed.add(tag);
          }
        }
      }
      for (const required of REQUIRED_TAGS) {
        expect(observed.has(required), `Missing seed coverage for tag "${required}"`).toBe(true);
      }
    });

    it('includes at least one recipe-scoped substitution', () => {
      const recipeScoped = db
        .select({ n: sql<number>`count(*)` })
        .from(substitutions)
        .where(eq(substitutions.scope, 'recipe'))
        .all();
      expect(recipeScoped[0]?.n ?? 0).toBeGreaterThan(0);
    });
  });

  describe('batches', () => {
    it('includes at least one shelf-stable batch (NULL expires_at)', () => {
      const shelfStable = db
        .select({ n: sql<number>`count(*)` })
        .from(batches)
        .where(isNull(batches.expiresAt))
        .all();
      expect(shelfStable[0]?.n ?? 0).toBeGreaterThan(0);
    });
    it('includes at least one batch with explicit expires_at', () => {
      const dated = db
        .select({ n: sql<number>`count(*)` })
        .from(batches)
        .where(isNotNull(batches.expiresAt))
        .all();
      expect(dated[0]?.n ?? 0).toBeGreaterThan(0);
    });
    it('includes a freezer batch', () => {
      const freezer = db
        .select({ n: sql<number>`count(*)` })
        .from(batches)
        .where(eq(batches.location, 'freezer'))
        .all();
      expect(freezer[0]?.n ?? 0).toBeGreaterThan(0);
    });
    it('seeds two milk batches with different expires_at (FIFO fixture)', () => {
      const milkRows = raw
        .prepare(
          `SELECT b.expires_at FROM batches b
             JOIN ingredient_variants v ON v.id = b.variant_id
             JOIN ingredients i ON i.id = v.ingredient_id
             WHERE i.slug = 'milk' AND v.slug = 'full-cream'
             ORDER BY b.expires_at ASC`
        )
        .all() as { expires_at: string }[];
      expect(milkRows.length).toBe(2);
      expect(milkRows[0]?.expires_at).not.toBe(milkRows[1]?.expires_at);
    });
    it('includes at least one batch with NULL prep_state', () => {
      const nullPrep = db
        .select({ n: sql<number>`count(*)` })
        .from(batches)
        .where(isNull(batches.prepStateId))
        .all();
      expect(nullPrep[0]?.n ?? 0).toBeGreaterThan(0);
    });
    it('wires the recipe_run yielded_batch_id back to a recipe_run batch', () => {
      const runs = db.select().from(recipeRuns).all();
      expect(runs.length).toBe(1);
      expect(runs[0]?.yieldedBatchId).not.toBeNull();
    });
  });

  describe('plan entries', () => {
    it('mixes slotted dinners and ad-hoc-style snack entries', () => {
      const dinners = db
        .select({ n: sql<number>`count(*)` })
        .from(planEntries)
        .where(eq(planEntries.slot, 'dinner'))
        .all();
      const snacks = db
        .select({ n: sql<number>`count(*)` })
        .from(planEntries)
        .where(eq(planEntries.slot, 'snack'))
        .all();
      expect(dinners[0]?.n ?? 0).toBeGreaterThan(0);
      expect(snacks[0]?.n ?? 0).toBeGreaterThan(0);
    });
    it('puts two entries on the prep-session slot with distinct positions', () => {
      const prepEntries = raw
        .prepare(`SELECT position FROM plan_entries WHERE slot = 'prep-session' ORDER BY position`)
        .all() as { position: number }[];
      expect(prepEntries.length).toBe(2);
      expect(prepEntries[0]?.position).toBe(0);
      expect(prepEntries[1]?.position).toBe(1);
    });
  });

  describe('idempotency', () => {
    it('re-running seedFood returns skipped=true and zero counts', () => {
      const reRun = seedFood(db);
      expect(reRun.skipped).toBe(true);
      expect(reRun.ingredients).toBe(0);
      expect(reRun.recipes).toBe(0);
    });
    it('re-run leaves existing row counts intact', () => {
      const before = raw.prepare(`SELECT COUNT(*) AS n FROM ingredients`).get() as { n: number };
      seedFood(db);
      const after = raw.prepare(`SELECT COUNT(*) AS n FROM ingredients`).get() as { n: number };
      expect(after.n).toBe(before.n);
    });
  });

  describe('variant shelf-life propagation', () => {
    it('inherits per-ingredient defaults to variants when no override', () => {
      // Butter: 30d fridge / 365d freezer. All 3 variants should inherit both.
      const rows = raw
        .prepare(
          `SELECT v.slug, v.default_shelf_life_days_fridge AS fridge, v.default_shelf_life_days_freezer AS freezer
             FROM ingredient_variants v JOIN ingredients i ON i.id = v.ingredient_id
             WHERE i.slug = 'butter'`
        )
        .all() as { slug: string; fridge: number | null; freezer: number | null }[];
      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row.fridge).toBe(30);
        expect(row.freezer).toBe(365);
      }
    });
    it('respects per-variant overrides (corn fresh-cob / canned / frozen)', () => {
      const rows = raw
        .prepare(
          `SELECT v.slug, v.default_shelf_life_days_fridge AS fridge, v.default_shelf_life_days_freezer AS freezer
             FROM ingredient_variants v JOIN ingredients i ON i.id = v.ingredient_id
             WHERE i.slug = 'corn'
             ORDER BY v.slug`
        )
        .all() as { slug: string; fridge: number | null; freezer: number | null }[];
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      expect(bySlug.get('fresh-cob')?.fridge).toBe(5);
      expect(bySlug.get('canned-brine')?.fridge).toBe(365);
      expect(bySlug.get('frozen-kernels')?.freezer).toBe(365);
      expect(bySlug.get('frozen-kernels')?.fridge).toBeNull();
    });
  });

  describe('aliases', () => {
    it('every alias resolves to exactly one of (ingredient, variant)', () => {
      const orphans = raw
        .prepare(
          `SELECT COUNT(*) AS n FROM ingredient_aliases
             WHERE (ingredient_id IS NULL AND variant_id IS NULL)
                OR (ingredient_id IS NOT NULL AND variant_id IS NOT NULL)`
        )
        .get() as { n: number };
      expect(orphans.n).toBe(0);
    });
    it('persists source="user" (PRD-106 enum has no "seed" value)', () => {
      const sourceMix = raw
        .prepare(`SELECT source, COUNT(*) AS n FROM ingredient_aliases GROUP BY source`)
        .all() as { source: string; n: number }[];
      expect(sourceMix.length).toBe(1);
      expect(sourceMix[0]?.source).toBe('user');
    });
  });
});
