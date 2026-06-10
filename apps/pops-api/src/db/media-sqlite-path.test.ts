/**
 * Resolver tests for the media pillar's SQLite path.
 *
 * Covers the precedence chain: MEDIA_SQLITE_PATH > <dirname(SQLITE_PATH)>/media.db > fallback.
 *
 * Mirrors core-sqlite-path.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MEDIA_SQLITE_PATH, resolveMediaSqlitePath } from './media-sqlite-path.js';

const originalMediaPath = process.env['MEDIA_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['MEDIA_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalMediaPath === undefined) delete process.env['MEDIA_SQLITE_PATH'];
  else process.env['MEDIA_SQLITE_PATH'] = originalMediaPath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveMediaSqlitePath', () => {
  it('returns MEDIA_SQLITE_PATH verbatim when set', () => {
    process.env['MEDIA_SQLITE_PATH'] = '/abs/path/media.db';
    expect(resolveMediaSqlitePath()).toBe('/abs/path/media.db');
  });

  it('derives the path from the shared SQLITE_PATH when MEDIA_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveMediaSqlitePath()).toBe('/opt/pops/data/media.db');
  });

  it('handles relative SQLITE_PATH values', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveMediaSqlitePath()).toBe('data/media.db');
  });

  it('falls back to ./data/media.db when neither env is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(resolveMediaSqlitePath()).toBe(DEFAULT_MEDIA_SQLITE_PATH);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
