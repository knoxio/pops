/**
 * Integration tests for the hero-image surface: ts-rest upload/remove
 * (base64) + the plain Express binary serve route. A real PNG is produced
 * with sharp so the dimension probe + thumbnail pass run. Files land in a
 * per-test FOOD_RECIPES_DIR.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;
let recipeId: number;

const SIMPLE_DSL = `@recipe(slug="toast", title="Toast")
@yield(toast, 1:count)
@ingredient(1, bread, 1:count)
@step("Toast @1.")
`;

function app() {
  return createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' });
}

async function pngBase64(): Promise<string> {
  const buf = await sharp({
    create: { width: 16, height: 12, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
  return buf.toString('base64');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-hero-test-'));
  process.env['FOOD_RECIPES_DIR'] = join(tmpDir, 'recipes');
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FOOD_RECIPES_DIR'];
});

describe('hero-image REST', () => {
  it('uploads, serves the binary, then removes', async () => {
    const client = makeClient(app());
    const created = await client.recipes.create(SIMPLE_DSL);
    recipeId = created.recipeId;

    const uploaded = await client.heroImage.upload(recipeId, 'image/png', await pngBase64());
    expect(uploaded.data.heroImagePath).toBe(`${recipeId}/hero.png`);
    expect(uploaded.data.width).toBe(16);
    expect(uploaded.data.height).toBe(12);

    const served = await request(app()).get(`/recipes/${recipeId}/hero.png`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');

    const thumb = await request(app()).get(`/recipes/${recipeId}/hero-thumb.webp`);
    expect(thumb.status).toBe(200);

    const removed = await client.heroImage.remove(recipeId);
    expect(removed.ok).toBe(true);

    const gone = await request(app()).get(`/recipes/${recipeId}/hero.png`);
    expect(gone.status).toBe(404);
  });

  it('404s upload for an unknown recipe', async () => {
    await expect(
      makeClient(app()).heroImage.upload(999999, 'image/png', await pngBase64())
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s upload of undecodable bytes', async () => {
    const client = makeClient(app());
    const created = await client.recipes.create(SIMPLE_DSL);
    await expect(
      client.heroImage.upload(
        created.recipeId,
        'image/png',
        Buffer.from('not an image').toString('base64')
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it('falls through to the recipes route for a non-hero path', async () => {
    // GET /recipes/:slug/drafts must NOT be shadowed by the serve route.
    const client = makeClient(app());
    await client.recipes.create(SIMPLE_DSL);
    const drafts = await client.recipes.listDrafts('toast');
    expect(Array.isArray(drafts.drafts)).toBe(true);
  });
});
