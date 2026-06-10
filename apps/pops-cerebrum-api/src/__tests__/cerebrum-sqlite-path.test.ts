/**
 * Resolver tests for cerebrum-api's local SQLite path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_CEREBRUM_API_SQLITE_PATH,
  resolveCerebrumSqlitePath,
} from '../cerebrum-sqlite-path.js';

const originalCerebrumPath = process.env['CEREBRUM_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['CEREBRUM_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalCerebrumPath === undefined) delete process.env['CEREBRUM_SQLITE_PATH'];
  else process.env['CEREBRUM_SQLITE_PATH'] = originalCerebrumPath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveCerebrumSqlitePath (cerebrum-api)', () => {
  it('returns CEREBRUM_SQLITE_PATH verbatim when set', () => {
    process.env['CEREBRUM_SQLITE_PATH'] = '/data/sqlite/cerebrum.db';
    expect(resolveCerebrumSqlitePath()).toBe('/data/sqlite/cerebrum.db');
  });

  it('derives the path from the shared SQLITE_PATH when CEREBRUM_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveCerebrumSqlitePath()).toBe('/opt/pops/data/cerebrum.db');
  });

  it('falls back to ./data/cerebrum.db when neither env is set', () => {
    // The per-pillar container resolver intentionally stays silent on
    // the fallback branch (unlike pops-api's resolver). Asserting the
    // returned path is enough — no console.warn to spy on here.
    expect(resolveCerebrumSqlitePath()).toBe(DEFAULT_CEREBRUM_API_SQLITE_PATH);
  });
});
