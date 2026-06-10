/**
 * Resolver tests for the cerebrum pillar's SQLite path.
 *
 * Covers the precedence chain: CEREBRUM_SQLITE_PATH > <dirname(SQLITE_PATH)>/cerebrum.db > fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CEREBRUM_SQLITE_PATH, resolveCerebrumSqlitePath } from './cerebrum-sqlite-path.js';

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

describe('resolveCerebrumSqlitePath', () => {
  it('returns CEREBRUM_SQLITE_PATH verbatim when set', () => {
    process.env['CEREBRUM_SQLITE_PATH'] = '/abs/path/cerebrum.db';
    expect(resolveCerebrumSqlitePath()).toBe('/abs/path/cerebrum.db');
  });

  it('derives the path from the shared SQLITE_PATH when CEREBRUM_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveCerebrumSqlitePath()).toBe('/opt/pops/data/cerebrum.db');
  });

  it('handles relative SQLITE_PATH values', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveCerebrumSqlitePath()).toBe('data/cerebrum.db');
  });

  it('falls back to ./data/cerebrum.db when neither env is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(resolveCerebrumSqlitePath()).toBe(DEFAULT_CEREBRUM_SQLITE_PATH);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
