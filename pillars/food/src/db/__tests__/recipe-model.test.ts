/**
 * Recipe + version invariant tests — exercises the recipe + version schema
 * against an in-memory SQLite seeded with the food migrations.
 */

import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CannotEditPublishedVersion,
  CannotPromoteUncompiledVersion,
  SlugAlreadyRegisteredError,
} from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { recipes, recipeTags, recipeVersions, slugRegistry } from '../schema.js';
import { createIngredient } from '../services/ingredients.js';
import { type FoodDb } from '../services/ingredients.js';
import {
  createNewVersion,
  promoteVersion,
  updateDraftVersion,
} from '../services/recipe-versions.js';
import {
  archiveRecipe,
  createRecipe,
  deleteRecipe,
  renameRecipeSlug,
} from '../services/recipes.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

function makeCompiledRecipe(
  db: FoodDb,
  slug: string,
  title = 'Test Recipe'
): { recipeId: number; versionId: number } {
  const created = createRecipe(db, {
    slug,
    firstVersion: { title, bodyDsl: '@recipe(' + slug + ')\n' },
  });
  // Mark the first version compiled so promoteVersion can accept it.
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, created.version.id))
    .run();
  return { recipeId: created.recipe.id, versionId: created.version.id };
}

describe('recipe + version invariants', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates the recipe tables', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['recipes', 'recipe_versions', 'recipe_tags']));
    });

    it('creates the partial UNIQUE on status="current"', () => {
      const partial = raw
        .prepare(`SELECT sql FROM sqlite_master WHERE name='uq_recipe_versions_one_current'`)
        .get() as { sql: string } | undefined;
      expect(partial?.sql).toMatch(/WHERE.*status.*current/i);
    });
  });

  describe('createRecipe + slug_registry', () => {
    it('creates the matching slug_registry row', () => {
      const { recipe } = createRecipe(db, {
        slug: 'smash-patty',
        firstVersion: { title: 'Smash patty', bodyDsl: '@recipe(smash-patty)' },
      });
      const reg = db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'smash-patty')).all();
      expect(reg[0]?.kind).toBe('recipe');
      expect(reg[0]?.targetId).toBe(recipe.id);
    });

    it('throws SlugAlreadyRegisteredError when slug collides with an ingredient', () => {
      createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
      try {
        createRecipe(db, {
          slug: 'banana',
          firstVersion: { title: 'Banana recipe', bodyDsl: '@recipe(banana)' },
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(SlugAlreadyRegisteredError);
        expect((err as SlugAlreadyRegisteredError).kind).toBe('ingredient');
      }
    });

    it('creates a first draft version at version_no=1', () => {
      const { version } = createRecipe(db, {
        slug: 'smash-patty',
        firstVersion: { title: 'Smash patty', bodyDsl: '@recipe(smash-patty)' },
      });
      expect(version.versionNo).toBe(1);
      expect(version.status).toBe('draft');
      expect(version.compileStatus).toBe('uncompiled');
    });
  });

  describe('createNewVersion', () => {
    it('computes the next version_no monotonically', () => {
      const { recipeId } = makeCompiledRecipe(db, 'pad-thai');
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'Pad Thai v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      const v3 = createNewVersion(db, {
        recipeId,
        title: 'Pad Thai v3',
        bodyDsl: '@recipe(pad-thai)',
      });
      expect(v2.versionNo).toBe(2);
      expect(v3.versionNo).toBe(3);
    });

    it('two concurrent createNewVersion calls land on distinct version_nos', () => {
      const { recipeId } = makeCompiledRecipe(db, 'pad-thai');
      // Simulate concurrency by serialising — the partial-unique on
      // (recipe_id, version_no) is what guarantees no overlap. The service
      // computes next sequentially inside a transaction, so back-to-back calls
      // both succeed and land at 2, 3.
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      const v3 = createNewVersion(db, {
        recipeId,
        title: 'v3',
        bodyDsl: '@recipe(pad-thai)',
      });
      expect([v2.versionNo, v3.versionNo]).toEqual([2, 3]);
    });
  });

  describe('promoteVersion', () => {
    it('throws CannotPromoteUncompiledVersion if compile_status != "compiled"', () => {
      const { version } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'v1', bodyDsl: '@recipe(pad-thai)' },
      });
      // Still uncompiled.
      expect(() => promoteVersion(db, version.id)).toThrow(CannotPromoteUncompiledVersion);
    });

    it('archives the previously-current version atomically', () => {
      const { recipeId, versionId: v1 } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, v1);
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      db.update(recipeVersions)
        .set({ compileStatus: 'compiled' })
        .where(eq(recipeVersions.id, v2.id))
        .run();
      promoteVersion(db, v2.id);

      const currents = db
        .select({ id: recipeVersions.id })
        .from(recipeVersions)
        .where(and(eq(recipeVersions.recipeId, recipeId), eq(recipeVersions.status, 'current')))
        .all();
      expect(currents).toHaveLength(1);
      expect(currents[0]?.id).toBe(v2.id);

      const v1Row = db
        .select({ status: recipeVersions.status })
        .from(recipeVersions)
        .where(eq(recipeVersions.id, v1))
        .all();
      expect(v1Row[0]?.status).toBe('archived');
    });

    it('updates recipes.current_version_id', () => {
      const { recipeId, versionId } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, versionId);
      const recipe = db.select().from(recipes).where(eq(recipes.id, recipeId)).all();
      expect(recipe[0]?.currentVersionId).toBe(versionId);
    });

    it('the partial UNIQUE prevents a manual UPDATE from creating two currents', () => {
      const { recipeId, versionId: v1 } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, v1);
      // Sneak a second version into 'current' directly — should fail the
      // partial UNIQUE.
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      expect(() =>
        raw.prepare(`UPDATE recipe_versions SET status='current' WHERE id=?`).run(v2.id)
      ).toThrow();
    });

    it('re-promoting an already-current version is idempotent', () => {
      const { versionId } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, versionId);
      const second = promoteVersion(db, versionId);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.row.status).toBe('current');
      }
    });

    it('returns ok:true with the promoted row on the happy path', () => {
      const { versionId } = makeCompiledRecipe(db, 'pad-thai');
      const result = promoteVersion(db, versionId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.row.id).toBe(versionId);
        expect(result.row.status).toBe('current');
      }
    });

    it('rolls the archive step back when the update-to-current trips a constraint', () => {
      // `promoteVersion` archives the previously-current row BEFORE flipping
      // the new one to current, both inside a throw-based drizzle transaction,
      // so a constraint failure on the second update rolls the archive back
      // too — leaving the recipe with its original current intact.
      //
      // Trigger the conflict deterministically with a `RAISE(ABORT)` trigger
      // on `UPDATE OF status` for the target row — same post-condition the
      // partial-UNIQUE would enforce against a racing concurrent promote. The
      // error code is `SQLITE_CONSTRAINT_TRIGGER` (not
      // `SQLITE_CONSTRAINT_UNIQUE`), so `isUniqueConstraintError` re-throws and
      // the test asserts on the post-condition rather than the return shape:
      // v1 must remain `current` (archive rolled back).
      const { recipeId, versionId: v1 } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, v1);
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      db.update(recipeVersions)
        .set({ compileStatus: 'compiled' })
        .where(eq(recipeVersions.id, v2.id))
        .run();
      raw.exec(`CREATE TRIGGER block_v2_promote
                BEFORE UPDATE OF status ON recipe_versions
                FOR EACH ROW
                WHEN NEW.id = ${v2.id} AND NEW.status = 'current'
                BEGIN SELECT RAISE(ABORT, 'simulated concurrent promotion'); END;`);
      expect(() => promoteVersion(db, v2.id)).toThrow();
      raw.exec(`DROP TRIGGER block_v2_promote;`);
      const v1Row = db
        .select({ status: recipeVersions.status })
        .from(recipeVersions)
        .where(eq(recipeVersions.id, v1))
        .all()[0];
      expect(v1Row?.status).toBe('current');
    });
  });

  describe('updateDraftVersion', () => {
    it('throws CannotEditPublishedVersion on a current version', () => {
      const { versionId } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, versionId);
      expect(() =>
        updateDraftVersion(db, versionId, { bodyDsl: '@recipe(pad-thai)\n@step("noop")' })
      ).toThrow(CannotEditPublishedVersion);
    });

    it('throws CannotEditPublishedVersion on an archived version', () => {
      const { recipeId, versionId } = makeCompiledRecipe(db, 'pad-thai');
      promoteVersion(db, versionId);
      const v2 = createNewVersion(db, {
        recipeId,
        title: 'v2',
        bodyDsl: '@recipe(pad-thai)',
      });
      db.update(recipeVersions)
        .set({ compileStatus: 'compiled' })
        .where(eq(recipeVersions.id, v2.id))
        .run();
      promoteVersion(db, v2.id); // v1 → archived
      expect(() => updateDraftVersion(db, versionId, { title: 'new title' })).toThrow(
        CannotEditPublishedVersion
      );
    });

    it('updates a draft version', () => {
      const { version } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'v1', bodyDsl: '@recipe(pad-thai)' },
      });
      const updated = updateDraftVersion(db, version.id, { title: 'v1 renamed' });
      expect(updated.title).toBe('v1 renamed');
    });
  });

  describe('FK enforcement', () => {
    it('refuses to delete an ingredient referenced as a yield', () => {
      const ing = createIngredient(db, {
        name: 'Patty',
        slug: 'patty',
        defaultUnit: 'count',
      });
      const { version } = createRecipe(db, {
        slug: 'smash',
        firstVersion: { title: 'Smash', bodyDsl: '@recipe(smash)' },
      });
      db.update(recipeVersions)
        .set({ yieldIngredientId: ing.id })
        .where(eq(recipeVersions.id, version.id))
        .run();
      expect(() => raw.prepare(`DELETE FROM ingredients WHERE id=?`).run(ing.id)).toThrow();
    });
  });

  describe('archiveRecipe', () => {
    it('does NOT remove the slug_registry entry', () => {
      const { recipe } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'Pad Thai', bodyDsl: '@recipe(pad-thai)' },
      });
      archiveRecipe(db, recipe.id);
      const reg = db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'pad-thai')).all();
      expect(reg).toHaveLength(1);
      const updated = db.select().from(recipes).where(eq(recipes.id, recipe.id)).all();
      expect(updated[0]?.archivedAt).not.toBeNull();
    });
  });

  describe('renameRecipeSlug', () => {
    it('updates both tables atomically and rolls back on collision', () => {
      createRecipe(db, {
        slug: 'old-slug',
        firstVersion: { title: 't', bodyDsl: '@recipe(old-slug)' },
      });
      createIngredient(db, { name: 'Apple', slug: 'apple', defaultUnit: 'count' });
      renameRecipeSlug(db, 'old-slug', 'new-slug');
      expect(
        db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'new-slug')).all()
      ).toHaveLength(1);
      expect(
        db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'old-slug')).all()
      ).toHaveLength(0);
      expect(() => renameRecipeSlug(db, 'new-slug', 'apple')).toThrow(SlugAlreadyRegisteredError);
      expect(db.select().from(recipes).where(eq(recipes.slug, 'new-slug')).all()).toHaveLength(1);
    });
  });

  describe('deleteRecipe', () => {
    it('removes the slug_registry entry', () => {
      const { recipe } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 't', bodyDsl: '@recipe(pad-thai)' },
      });
      deleteRecipe(db, recipe.id);
      expect(
        db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'pad-thai')).all()
      ).toHaveLength(0);
    });
  });

  describe('recipe_tags', () => {
    let recipeId: number;

    beforeEach(() => {
      const { recipe } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'Pad Thai', bodyDsl: '@recipe(pad-thai)' },
      });
      recipeId = recipe.id;
    });

    it('PK rejects duplicate (recipe_id, tag)', () => {
      raw.prepare(`INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, 'vegan')`).run(recipeId);
      expect(() =>
        raw.prepare(`INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, 'vegan')`).run(recipeId)
      ).toThrow();
    });

    it('stores tag case-preserved; index lookups are case-insensitive', () => {
      raw.prepare(`INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, 'Vegan')`).run(recipeId);
      const stored = db
        .select({ tag: recipeTags.tag })
        .from(recipeTags)
        .where(eq(recipeTags.recipeId, recipeId))
        .all();
      expect(stored[0]?.tag).toBe('Vegan');
      // Case-insensitive lookup via the NOCASE index.
      const hit = raw
        .prepare(`SELECT tag FROM recipe_tags WHERE tag = 'vegan' COLLATE NOCASE`)
        .all() as { tag: string }[];
      expect(hit).toHaveLength(1);
    });
  });

  describe('service guard — direct INSERT bypasses registry', () => {
    it('a raw INSERT into recipes does NOT populate slug_registry', () => {
      raw.prepare(`INSERT INTO recipes (slug, recipe_type) VALUES ('orphan', 'plate')`).run();
      expect(db.select().from(slugRegistry).all()).toHaveLength(0);
    });
  });
});
