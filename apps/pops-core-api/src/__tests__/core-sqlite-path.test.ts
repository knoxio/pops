/**
 * Resolver tests — guards the precedence chain so future pillar work
 * doesn't accidentally drift core-api away from pops-api's resolver.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CORE_SQLITE_PATH, resolveCoreSqlitePath } from '../core-sqlite-path.js';

const originalCorePath = process.env['CORE_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['CORE_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalCorePath === undefined) delete process.env['CORE_SQLITE_PATH'];
  else process.env['CORE_SQLITE_PATH'] = originalCorePath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveCoreSqlitePath', () => {
  it('returns CORE_SQLITE_PATH verbatim when set', () => {
    process.env['CORE_SQLITE_PATH'] = '/abs/path/core.db';
    expect(resolveCoreSqlitePath()).toBe('/abs/path/core.db');
  });

  it('derives <dirname(SQLITE_PATH)>/core.db when CORE_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveCoreSqlitePath()).toBe('/opt/pops/data/core.db');
  });

  it('handles a relative SQLITE_PATH', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveCoreSqlitePath()).toBe('data/core.db');
  });

  it('falls back to ./data/core.db when neither env is set', () => {
    expect(resolveCoreSqlitePath()).toBe(DEFAULT_CORE_SQLITE_PATH);
  });
});
