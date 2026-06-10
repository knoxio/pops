/**
 * Resolver tests — guards the precedence chain so future pillar work
 * doesn't accidentally drift food-api away from pops-api's resolver.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_FOOD_SQLITE_PATH, resolveFoodSqlitePath } from '../food-sqlite-path.js';

const originalFoodPath = process.env['FOOD_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['FOOD_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalFoodPath === undefined) delete process.env['FOOD_SQLITE_PATH'];
  else process.env['FOOD_SQLITE_PATH'] = originalFoodPath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveFoodSqlitePath', () => {
  it('returns FOOD_SQLITE_PATH verbatim when set', () => {
    process.env['FOOD_SQLITE_PATH'] = '/abs/path/food.db';
    expect(resolveFoodSqlitePath()).toBe('/abs/path/food.db');
  });

  it('derives the path from the shared SQLITE_PATH when FOOD_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveFoodSqlitePath()).toBe('/opt/pops/data/food.db');
  });

  it('falls back to ./data/food.db when neither env is set', () => {
    expect(resolveFoodSqlitePath()).toBe(DEFAULT_FOOD_SQLITE_PATH);
  });
});
