/**
 * Integration test for the `solver.canICook` REST surface. The ranking +
 * substitution-coverage maths live in the db/services tests; here we assert
 * the wire envelope end-to-end (empty catalogue → empty result) and that
 * the input filters validate.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-solver-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('solver REST', () => {
  it('returns an empty result for an empty catalogue', async () => {
    const res = await client().solver.canICook({});
    expect(res).toEqual({ totalCandidates: 0, cookableCount: 0, recipes: [] });
  });

  it('accepts the filter set without error', async () => {
    const res = await client().solver.canICook({
      excludeSubs: true,
      recipeTypes: ['plate', 'sauce'],
      tags: ['quick'],
      maxMinutes: 30,
    });
    expect(res.recipes).toEqual([]);
  });

  it('rejects an invalid recipeType at the zod boundary with 400', async () => {
    await expect(client().solver.canICook({ recipeTypes: ['not-a-type'] })).rejects.toMatchObject({
      status: 400,
    });
  });
});
