/**
 * Resolver tests — guards the precedence chain so future pillar work
 * doesn't accidentally drift lists-api away from pops-api's resolver.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_LISTS_SQLITE_PATH, resolveListsSqlitePath } from '../lists-sqlite-path.js';

const originalListsPath = process.env['LISTS_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['LISTS_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalListsPath === undefined) delete process.env['LISTS_SQLITE_PATH'];
  else process.env['LISTS_SQLITE_PATH'] = originalListsPath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveListsSqlitePath', () => {
  it('returns LISTS_SQLITE_PATH verbatim when set', () => {
    process.env['LISTS_SQLITE_PATH'] = '/abs/path/lists.db';
    expect(resolveListsSqlitePath()).toBe('/abs/path/lists.db');
  });

  it('derives the path from the shared SQLITE_PATH when LISTS_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveListsSqlitePath()).toBe('/opt/pops/data/lists.db');
  });

  it('falls back to ./data/lists.db when neither env is set', () => {
    expect(resolveListsSqlitePath()).toBe(DEFAULT_LISTS_SQLITE_PATH);
  });
});
