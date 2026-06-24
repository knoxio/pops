/**
 * Integration tests for the `recipes.*` REST surface. Covers the
 * create→list→draft→save→promote lifecycle plus the not-found / bad-DSL
 * error mapping. DSL parse/compile internals are covered by the dsl tests;
 * here we assert the wire envelopes + HTTP status mapping.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

const SIMPLE_DSL = `@recipe(
  slug="grilled-cheese",
  title="Grilled Cheese"
)
@yield(grilled-cheese, 1:count)
@ingredient(1, bread, 2:count)
@ingredient(2, butter, 10:g)
@step("Butter the @1 and grill.")
`;

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-recipes-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('recipes REST — lifecycle', () => {
  it('creates from DSL, lists it, and renders a specific version', async () => {
    const api = client();
    const created = await api.recipes.create(SIMPLE_DSL);
    expect(created.slug).toBe('grilled-cheese');
    expect(created.recipeId).toBeGreaterThan(0);
    expect(created.versionId).toBeGreaterThan(0);

    // Freshly created recipes are draft-only (no current version yet), so
    // include drafts to see them in the list.
    const list = await api.recipes.list({ includeDraftOnly: true });
    expect(list.items.map((r) => r.slug)).toContain('grilled-cheese');

    const rendered = await api.recipes.getForRendering('grilled-cheese', 1);
    expect(rendered).toBeTruthy();

    const drafts = await api.recipes.listDrafts('grilled-cheese');
    expect(Array.isArray(drafts.drafts)).toBe(true);

    const slugs = await api.recipes.listProposedSlugs(created.versionId);
    expect(Array.isArray(slugs.items)).toBe(true);
  });

  it('saves a draft and reports a compile result', async () => {
    const api = client();
    const created = await api.recipes.create(SIMPLE_DSL);
    const saved = await api.recipes.saveDraft(created.versionId, SIMPLE_DSL);
    expect(saved).toHaveProperty('compile');
  });

  it('archives a recipe', async () => {
    const api = client();
    await api.recipes.create(SIMPLE_DSL);
    expect(await api.recipes.archiveRecipe('grilled-cheese')).toEqual({ ok: true });
  });
});

describe('recipes REST — error mapping', () => {
  it('rejects DSL with no @recipe header as 400', async () => {
    await expect(client().recipes.create('just some text')).rejects.toMatchObject({ status: 400 });
  });

  it('404s getForRendering + listDrafts for an unknown slug', async () => {
    const api = client();
    await expect(api.recipes.getForRendering('nope')).rejects.toMatchObject({ status: 404 });
    await expect(api.recipes.listDrafts('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('404s saveDraft on an unknown version', async () => {
    await expect(client().recipes.saveDraft(999999, SIMPLE_DSL)).rejects.toMatchObject({
      status: 404,
    });
  });
});
