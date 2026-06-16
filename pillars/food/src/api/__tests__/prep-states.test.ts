/**
 * Integration tests for the `prepStates.*` REST surface in pops-food-api.
 * Slug validation maps to 400, slug collisions to 409. Registry mechanics
 * are covered in the db package's own tests.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-prep-states-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('prepStates REST', () => {
  it('creates and lists prep states', async () => {
    const api = client();
    const created = await api.prepStates.create({ slug: 'diced', name: 'Diced' });
    expect(created.data.slug).toBe('diced');
    expect(created.data.name).toBe('Diced');

    const list = await api.prepStates.list();
    expect(list.items.map((p) => p.slug)).toContain('diced');
  });

  it('maps an invalid slug to 400', async () => {
    await expect(
      client().prepStates.create({ slug: 'Not A Slug!', name: 'Bad' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps a duplicate slug to 409', async () => {
    const api = client();
    await api.prepStates.create({ slug: 'cooked', name: 'Cooked' });
    await expect(api.prepStates.create({ slug: 'cooked', name: 'Cooked 2' })).rejects.toMatchObject(
      {
        status: 409,
      }
    );
  });
});
