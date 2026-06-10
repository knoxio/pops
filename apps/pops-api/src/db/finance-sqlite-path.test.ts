/**
 * Resolver tests for the finance pillar's SQLite path.
 *
 * Covers the precedence chain: FINANCE_SQLITE_PATH > <dirname(SQLITE_PATH)>/finance.db > fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FINANCE_SQLITE_PATH, resolveFinanceSqlitePath } from './finance-sqlite-path.js';

const originalFinancePath = process.env['FINANCE_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['FINANCE_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalFinancePath === undefined) delete process.env['FINANCE_SQLITE_PATH'];
  else process.env['FINANCE_SQLITE_PATH'] = originalFinancePath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveFinanceSqlitePath', () => {
  it('returns FINANCE_SQLITE_PATH verbatim when set', () => {
    process.env['FINANCE_SQLITE_PATH'] = '/abs/path/finance.db';
    expect(resolveFinanceSqlitePath()).toBe('/abs/path/finance.db');
  });

  it('derives the path from the shared SQLITE_PATH when FINANCE_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveFinanceSqlitePath()).toBe('/opt/pops/data/finance.db');
  });

  it('handles relative SQLITE_PATH values', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveFinanceSqlitePath()).toBe('data/finance.db');
  });

  it('falls back to ./data/finance.db when neither env is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(resolveFinanceSqlitePath()).toBe(DEFAULT_FINANCE_SQLITE_PATH);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
