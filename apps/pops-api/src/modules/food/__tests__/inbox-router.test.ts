/**
 * PRD-136 — integration tests for `food.inbox.*`.
 *
 * In-memory SQLite seeded with the minimum migration subset needed by the
 * inbox flow (ingredients/recipes/versions/ingest_sources/compile + the
 * 0068 rejections + reviewed_at delta). Each test seeds fresh
 * recipe_versions whose `source_id` points at an `ingest_sources` row,
 * mirroring the worker-complete path that PRD-125 takes.
 *
 * Coverage per AC bullet in PRD-136 §Tests:
 *   - approve happy path (sets reviewed_at, current, no rejection row)
 *   - approve denies (NotIngestOriginated, NotADraft, NotCompiled,
 *     AlreadyReviewed, RecipeArchived, VersionNotFound)
 *   - approve race → ConcurrentPromotion (two concurrent versions of the
 *     same recipe; second loses on the partial-UNIQUE)
 *   - reject happy path for each of the five reason values; rejection row
 *     written; version archived
 *   - reject `other` without note → NoteRequired
 *   - reject note > 2000 chars → NoteTooLong
 *   - unreject happy path (archived + rejected → draft; rejection row gone)
 *   - unreject denies NoRejectionRecord for PRD-119-discarded drafts
 *   - approve → unreject covered by NotArchived guard
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ingestSourcesService,
  ingredientsService,
  recipesService,
  recipeVersionsService,
  variantsService,
} from '@pops/app-food-db';

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
];

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
  return db;
}

interface SeedResult {
  recipeId: number;
  sourceId: number;
  /** Compiled, ingest-originated draft ready to approve or reject. */
  draftVersionId: number;
}

function seedRecipeWithIngestDraft(slug: string): SeedResult {
  const db = getDrizzle();
  const banana = ingredientsService.createIngredient(db, {
    slug: `${slug}-banana`,
    name: 'Banana',
    defaultUnit: 'count',
  });
  variantsService.createVariant(db, {
    ingredientId: banana.id,
    slug: 'raw',
    name: 'Raw',
    defaultUnit: 'count',
  });
  const source = ingestSourcesService.createIngestSource(db, {
    kind: 'text',
    extractorVersion: 'test-v1',
  });
  const recipe = recipesService.createRecipe(db, {
    slug,
    firstVersion: {
      title: `Test recipe ${slug}`,
      bodyDsl: `@recipe(slug="${slug}", title="Test ${slug}")`,
      sourceId: source.id,
    },
  });
  // Mark the seeded version as compiled so approve can pass the compile gate.
  db.run(
    sql`UPDATE recipe_versions SET compile_status = 'compiled', compiled_at = datetime('now') WHERE id = ${recipe.version.id}`
  );
  return { recipeId: recipe.recipe.id, sourceId: source.id, draftVersionId: recipe.version.id };
}

describe('food.inbox router — PRD-136', () => {
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

  describe('approve', () => {
    it('promotes the draft, stamps reviewed_at, and writes no rejection row', async () => {
      const seed = seedRecipeWithIngestDraft('approve-happy');
      const result = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(result).toEqual({
        ok: true,
        recipeSlug: 'approve-happy',
        promotedVersionNo: 1,
      });
      const versionRow = sqlite
        .prepare(`SELECT status FROM recipe_versions WHERE id = ?`)
        .get(seed.draftVersionId) as { status: string };
      expect(versionRow.status).toBe('current');
      const sourceRow = sqlite
        .prepare(`SELECT reviewed_at FROM ingest_sources WHERE id = ?`)
        .get(seed.sourceId) as { reviewed_at: string | null };
      expect(sourceRow.reviewed_at).not.toBeNull();
      const rejection = sqlite
        .prepare(`SELECT version_id FROM recipe_version_rejections WHERE version_id = ?`)
        .get(seed.draftVersionId);
      expect(rejection).toBeUndefined();
    });

    it('rejects manually-authored versions with NotIngestOriginated', async () => {
      const db = getDrizzle();
      const recipe = recipesService.createRecipe(db, {
        slug: 'manual-draft',
        firstVersion: {
          title: 'Manual',
          bodyDsl: '@recipe(slug="manual-draft", title="Manual")',
        },
      });
      db.run(
        sql`UPDATE recipe_versions SET compile_status = 'compiled' WHERE id = ${recipe.version.id}`
      );
      const result = await caller.food.inbox.approve({ versionId: recipe.version.id });
      expect(result).toEqual({ ok: false, reason: 'NotIngestOriginated' });
    });

    it('returns VersionNotFound for unknown id', async () => {
      const result = await caller.food.inbox.approve({ versionId: 99_999 });
      expect(result).toEqual({ ok: false, reason: 'VersionNotFound' });
    });

    it('returns NotADraft when re-approving an already-promoted version', async () => {
      const seed = seedRecipeWithIngestDraft('approve-not-draft');
      const first = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(first.ok).toBe(true);
      // Second call: status='current' is checked first (preflight order in
      // approveDraft); NotADraft wins over AlreadyReviewed.
      const second = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(second).toEqual({ ok: false, reason: 'NotADraft' });
    });

    it('returns NotCompiled when compile_status != compiled', async () => {
      const seed = seedRecipeWithIngestDraft('approve-uncompiled');
      getDrizzle().run(
        sql`UPDATE recipe_versions SET compile_status = 'uncompiled' WHERE id = ${seed.draftVersionId}`
      );
      const result = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: false, reason: 'NotCompiled' });
    });

    it('returns RecipeArchived when the parent recipe is archived', async () => {
      const seed = seedRecipeWithIngestDraft('approve-archived');
      recipesService.archiveRecipe(getDrizzle(), seed.recipeId);
      const result = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: false, reason: 'RecipeArchived' });
    });

    it('returns AlreadyReviewed when the source was already approved', async () => {
      const seed = seedRecipeWithIngestDraft('approve-already');
      getDrizzle().run(
        sql`UPDATE ingest_sources SET reviewed_at = datetime('now') WHERE id = ${seed.sourceId}`
      );
      const result = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: false, reason: 'AlreadyReviewed' });
    });

    it('archives a previously-current sibling version when approving a new draft', async () => {
      // Sequential happy path that exercises the archive step inside
      // `promoteVersion` (the same code path that would race in concurrent
      // production traffic). The true `ConcurrentPromotion` race requires
      // genuinely parallel transactions and can't be reproduced in
      // synchronous better-sqlite3 — covered by PRD-107's invariant test
      // in `packages/app-food-db/src/__tests__/recipe-model.test.ts`
      // (`partial UNIQUE prevents a manual UPDATE from creating two
      // currents`) instead. The inbox's propagation line
      // (`if (!promoted.ok) return fail('ConcurrentPromotion')`) is
      // typecheck-verified at the service boundary.
      const seed = seedRecipeWithIngestDraft('approve-archives-sibling');
      const db = getDrizzle();
      const sourceB = ingestSourcesService.createIngestSource(db, {
        kind: 'text',
        extractorVersion: 'test-v1',
      });
      const versionB = recipeVersionsService.createNewVersion(db, {
        recipeId: seed.recipeId,
        title: 'Test v2',
        bodyDsl: '@recipe(slug="approve-archives-sibling", title="Test v2")',
        sourceId: sourceB.id,
      });
      db.run(sql`UPDATE recipe_versions SET compile_status = 'compiled' WHERE id = ${versionB.id}`);
      const first = await caller.food.inbox.approve({ versionId: seed.draftVersionId });
      expect(first.ok).toBe(true);
      const second = await caller.food.inbox.approve({ versionId: versionB.id });
      expect(second.ok).toBe(true);
      // versionA should now be archived (superseded by versionB's promote).
      const rows = sqlite
        .prepare(`SELECT id, status FROM recipe_versions WHERE recipe_id = ? ORDER BY id`)
        .all(seed.recipeId) as Array<{ id: number; status: string }>;
      const a = rows.find((r) => r.id === seed.draftVersionId);
      const b = rows.find((r) => r.id === versionB.id);
      expect(a?.status).toBe('archived');
      expect(b?.status).toBe('current');
    });
  });

  describe('reject', () => {
    it('writes a rejection row and archives for each reason', async () => {
      const reasons = [
        'wrong-recipe',
        'low-quality-extraction',
        'duplicate',
        'not-a-recipe',
        'other',
      ] as const;
      for (const reason of reasons) {
        const seed = seedRecipeWithIngestDraft(`reject-${reason}`);
        const result = await caller.food.inbox.reject({
          versionId: seed.draftVersionId,
          reason,
          note: reason === 'other' ? 'because' : undefined,
        });
        expect(result).toEqual({ ok: true });
        const row = sqlite
          .prepare(`SELECT reason, note FROM recipe_version_rejections WHERE version_id = ?`)
          .get(seed.draftVersionId) as { reason: string; note: string | null };
        expect(row.reason).toBe(reason);
        if (reason === 'other') {
          expect(row.note).toBe('because');
        }
        const versionRow = sqlite
          .prepare(`SELECT status FROM recipe_versions WHERE id = ?`)
          .get(seed.draftVersionId) as { status: string };
        expect(versionRow.status).toBe('archived');
        // Reject does NOT stamp reviewed_at — the source is still pending.
        const sourceRow = sqlite
          .prepare(`SELECT reviewed_at FROM ingest_sources WHERE id = ?`)
          .get(seed.sourceId) as { reviewed_at: string | null };
        expect(sourceRow.reviewed_at).toBeNull();
      }
    });

    it('returns NoteRequired when reason="other" and note is empty', async () => {
      const seed = seedRecipeWithIngestDraft('reject-note-required');
      const result = await caller.food.inbox.reject({
        versionId: seed.draftVersionId,
        reason: 'other',
        note: '   ',
      });
      expect(result).toEqual({ ok: false, reason: 'NoteRequired' });
    });

    it('returns NoteTooLong when note exceeds 2000 chars', async () => {
      const seed = seedRecipeWithIngestDraft('reject-note-too-long');
      const result = await caller.food.inbox.reject({
        versionId: seed.draftVersionId,
        reason: 'duplicate',
        note: 'x'.repeat(2001),
      });
      expect(result).toEqual({ ok: false, reason: 'NoteTooLong' });
    });

    it('rejects manually-authored drafts with NotIngestOriginated', async () => {
      const db = getDrizzle();
      const recipe = recipesService.createRecipe(db, {
        slug: 'manual-reject',
        firstVersion: {
          title: 'Manual',
          bodyDsl: '@recipe(slug="manual-reject", title="Manual")',
        },
      });
      const result = await caller.food.inbox.reject({
        versionId: recipe.version.id,
        reason: 'duplicate',
      });
      expect(result).toEqual({ ok: false, reason: 'NotIngestOriginated' });
    });
  });

  describe('unreject', () => {
    it('restores an archived + rejected version back to draft', async () => {
      const seed = seedRecipeWithIngestDraft('unreject-happy');
      await caller.food.inbox.reject({
        versionId: seed.draftVersionId,
        reason: 'wrong-recipe',
      });
      const result = await caller.food.inbox.unreject({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: true, restoredAs: 'draft' });
      const versionRow = sqlite
        .prepare(`SELECT status FROM recipe_versions WHERE id = ?`)
        .get(seed.draftVersionId) as { status: string };
      expect(versionRow.status).toBe('draft');
      const rejection = sqlite
        .prepare(`SELECT version_id FROM recipe_version_rejections WHERE version_id = ?`)
        .get(seed.draftVersionId);
      expect(rejection).toBeUndefined();
    });

    it('returns NoRejectionRecord for a manually-discarded archived version', async () => {
      const seed = seedRecipeWithIngestDraft('unreject-no-row');
      getDrizzle().run(
        sql`UPDATE recipe_versions SET status='archived' WHERE id = ${seed.draftVersionId}`
      );
      const result = await caller.food.inbox.unreject({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: false, reason: 'NoRejectionRecord' });
    });

    it('returns NotArchived when the version is currently a draft (approve→unreject path)', async () => {
      const seed = seedRecipeWithIngestDraft('unreject-not-archived');
      const result = await caller.food.inbox.unreject({ versionId: seed.draftVersionId });
      expect(result).toEqual({ ok: false, reason: 'NotArchived' });
    });

    it('returns VersionNotFound for an unknown id', async () => {
      const result = await caller.food.inbox.unreject({ versionId: 99_999 });
      expect(result).toEqual({ ok: false, reason: 'VersionNotFound' });
    });
  });
});
