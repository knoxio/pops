/**
 * PRD-124 — food.heroImage tRPC router integration tests.
 *
 * Exercises the upload + remove flow against an in-memory DB seeded with
 * the PRD-106 + PRD-107 migrations. sharp produces real bytes so the
 * assertions inspect the on-disk artefacts directly.
 */
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { TRPCError } from '@trpc/server';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';
import { createCaller } from '../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

type Caller = ReturnType<typeof appRouter.createCaller>;

const MIGRATION_FILES = ['0058_high_sentinel.sql', '0059_useful_hiroim.sql'] as const;

function loadMigrationSql(file: string): string {
  return readFileSync(resolve(__dirname, '../../../db/drizzle-migrations', file), 'utf8');
}

function applyMigrations(db: Database): void {
  for (const file of MIGRATION_FILES) {
    const sql = loadMigrationSql(file);
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed.length === 0) continue;
      db.exec(trimmed);
    }
  }
}

let recipeCounter = 0;

function insertRecipeAndVersion(db: Database, title = 'Test Recipe'): { recipeId: number } {
  recipeCounter += 1;
  const slug = `test-recipe-${recipeCounter}`;
  // recipes.id is auto-incremented; insert it first, then register the slug
  // with the freshly-minted id (slug_registry.target_id is NOT NULL).
  const r = db.prepare(`INSERT INTO recipes (slug, recipe_type) VALUES (?, 'plate')`).run(slug);
  const recipeId = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'recipe', ?)`).run(
    slug,
    recipeId
  );
  db.prepare(
    `INSERT INTO recipe_versions (recipe_id, version_no, status, title, body_dsl, compile_status)
     VALUES (?, 1, 'draft', ?, '@recipe(' || ? || ')\n', 'uncompiled')`
  ).run(recipeId, title, slug);
  return { recipeId };
}

async function makeJpegBase64(width = 256, height = 256): Promise<string> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  return buf.toString('base64');
}

async function makePngBase64(width = 256, height = 256): Promise<string> {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 50, g: 200, b: 150, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buf.toString('base64');
}

describe('food.heroImage router', () => {
  let db: Database;
  let caller: Caller;
  let tempDir: string;
  const originalDirEnv = process.env['FOOD_RECIPES_DIR'];

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    setDb(db);
    caller = createCaller(true);

    tempDir = join(tmpdir(), `pops-hero-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    process.env['FOOD_RECIPES_DIR'] = tempDir;
  });

  afterEach(() => {
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    if (originalDirEnv === undefined) delete process.env['FOOD_RECIPES_DIR'];
    else process.env['FOOD_RECIPES_DIR'] = originalDirEnv;
  });

  describe('upload', () => {
    it('writes original + thumbnails and updates hero_image_path', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      const contentBase64 = await makeJpegBase64(500, 500);

      const result = await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64,
      });

      expect(result.data.heroImagePath).toBe(`${recipeId}/hero.jpg`);
      expect(result.data.width).toBe(500);
      expect(result.data.height).toBe(500);

      const dir = join(tempDir, String(recipeId));
      expect(existsSync(join(dir, 'hero.jpg'))).toBe(true);
      expect(existsSync(join(dir, 'hero-thumb.webp'))).toBe(true);
      expect(existsSync(join(dir, 'hero-card.webp'))).toBe(true);

      const row = db.prepare(`SELECT hero_image_path FROM recipes WHERE id = ?`).get(recipeId) as {
        hero_image_path: string;
      };
      expect(row.hero_image_path).toBe(`${recipeId}/hero.jpg`);
    });

    it('produces a 320px thumbnail and 640px card', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      const contentBase64 = await makeJpegBase64(1200, 900);

      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64,
      });

      const thumbMeta = await sharp(join(tempDir, String(recipeId), 'hero-thumb.webp')).metadata();
      expect(thumbMeta.width).toBe(320);
      expect(thumbMeta.format).toBe('webp');

      const cardMeta = await sharp(join(tempDir, String(recipeId), 'hero-card.webp')).metadata();
      expect(cardMeta.width).toBe(640);
      expect(cardMeta.format).toBe('webp');
    });

    it('strips EXIF from thumbnails', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      // Build a JPEG with an EXIF block by piping through sharp `.withMetadata`.
      const original = await sharp({
        create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .withMetadata({ exif: { IFD0: { Copyright: 'pops-test', Artist: 'Joao' } } })
        .jpeg()
        .toBuffer();

      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64: original.toString('base64'),
      });

      const thumb = await sharp(join(tempDir, String(recipeId), 'hero-thumb.webp')).metadata();
      // sharp returns `exif` only if a chunk is present; absence means no EXIF.
      expect(thumb.exif).toBeUndefined();
    });

    it('replaces an existing hero with a different extension and deletes the old original', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64: await makeJpegBase64(),
      });
      expect(existsSync(join(tempDir, String(recipeId), 'hero.jpg'))).toBe(true);

      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/png',
        contentBase64: await makePngBase64(),
      });

      expect(existsSync(join(tempDir, String(recipeId), 'hero.jpg'))).toBe(false);
      expect(existsSync(join(tempDir, String(recipeId), 'hero.png'))).toBe(true);

      const row = db.prepare(`SELECT hero_image_path FROM recipes WHERE id = ?`).get(recipeId) as {
        hero_image_path: string;
      };
      expect(row.hero_image_path).toBe(`${recipeId}/hero.png`);
    });

    it('rejects oversize uploads with BAD_REQUEST before decoding', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      process.env['FOOD_HERO_MAX_BYTES'] = '1024';
      try {
        const big = Buffer.alloc(2048).toString('base64');
        await expect(
          caller.food.heroImage.upload({
            recipeId,
            mimeType: 'image/jpeg',
            contentBase64: big,
          })
        ).rejects.toThrow(TRPCError);

        try {
          await caller.food.heroImage.upload({
            recipeId,
            mimeType: 'image/jpeg',
            contentBase64: big,
          });
        } catch (err) {
          expect((err as TRPCError).code).toBe('BAD_REQUEST');
        }
      } finally {
        delete process.env['FOOD_HERO_MAX_BYTES'];
      }
    });

    it('rejects unsupported mime types', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      await expect(
        caller.food.heroImage.upload({
          recipeId,
          mimeType: 'image/heic',
          contentBase64: Buffer.from('x').toString('base64'),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('rejects bytes that sharp cannot decode', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      const garbage = Buffer.from('this is not an image').toString('base64');
      await expect(
        caller.food.heroImage.upload({
          recipeId,
          mimeType: 'image/jpeg',
          contentBase64: garbage,
        })
      ).rejects.toThrow(TRPCError);
      try {
        await caller.food.heroImage.upload({
          recipeId,
          mimeType: 'image/jpeg',
          contentBase64: garbage,
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
      }
    });

    it('throws NOT_FOUND when recipe does not exist', async () => {
      await expect(
        caller.food.heroImage.upload({
          recipeId: 999_999,
          mimeType: 'image/jpeg',
          contentBase64: await makeJpegBase64(),
        })
      ).rejects.toThrow(TRPCError);
      try {
        await caller.food.heroImage.upload({
          recipeId: 999_999,
          mimeType: 'image/jpeg',
          contentBase64: await makeJpegBase64(),
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('rejects non-positive recipe ids at the zod boundary', async () => {
      await expect(
        caller.food.heroImage.upload({
          recipeId: 0,
          mimeType: 'image/jpeg',
          contentBase64: 'AAAA',
        })
      ).rejects.toThrow();
    });

    it('throws UNAUTHORIZED without auth', async () => {
      const unauth = appRouter.createCaller({
        user: null,
        serviceAccount: null,
        internalCaller: false,
      });
      await expect(
        unauth.food.heroImage.upload({
          recipeId: 1,
          mimeType: 'image/jpeg',
          contentBase64: 'AAAA',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('remove', () => {
    it('removes all hero files and clears hero_image_path', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64: await makeJpegBase64(),
      });
      const dir = join(tempDir, String(recipeId));
      expect(readdirSync(dir).length).toBeGreaterThan(0);

      const result = await caller.food.heroImage.remove({ recipeId });
      expect(result.ok).toBe(true);

      expect(existsSync(join(dir, 'hero.jpg'))).toBe(false);
      expect(existsSync(join(dir, 'hero-thumb.webp'))).toBe(false);
      expect(existsSync(join(dir, 'hero-card.webp'))).toBe(false);

      const row = db.prepare(`SELECT hero_image_path FROM recipes WHERE id = ?`).get(recipeId) as {
        hero_image_path: string | null;
      };
      expect(row.hero_image_path).toBeNull();
    });

    it('is idempotent when nothing on disk to remove', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      const result = await caller.food.heroImage.remove({ recipeId });
      expect(result.ok).toBe(true);
    });

    it('throws NOT_FOUND for unknown recipe', async () => {
      await expect(caller.food.heroImage.remove({ recipeId: 12345 })).rejects.toThrow(TRPCError);
    });
  });

  describe('thumbnail fallback', () => {
    it('keeps the original even if thumbnail generation throws', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      // Mock sharp's output pipeline by writing a corrupted file the thumbnail
      // generator can't read. We achieve this by passing valid bytes for the
      // probe but then symlinking the writeable thumb target to a read-only
      // location. Cheaper: pre-create a directory at the thumbnail path so the
      // atomic write fails (rename onto a directory throws EISDIR).
      const dir = join(tempDir, String(recipeId));
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, 'hero-thumb.webp'), { recursive: true });

      const original = await makeJpegBase64();
      const result = await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64: original,
      });

      expect(result.data.heroImagePath).toBe(`${recipeId}/hero.jpg`);
      expect(existsSync(join(dir, 'hero.jpg'))).toBe(true);
      // Thumb target is still a directory — original is intact, no half-file.
    });
  });

  describe('disk pre-existing artefacts', () => {
    it('overwrites a same-extension original without leaving a leftover', async () => {
      const { recipeId } = insertRecipeAndVersion(db);
      const dir = join(tempDir, String(recipeId));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'hero.jpg'), Buffer.from('old-bytes'));

      await caller.food.heroImage.upload({
        recipeId,
        mimeType: 'image/jpeg',
        contentBase64: await makeJpegBase64(),
      });

      const remaining = readdirSync(dir).filter((n) => /^hero\.(jpg|jpeg|png|webp)$/.test(n));
      expect(remaining).toEqual(['hero.jpg']);
    });
  });
});
