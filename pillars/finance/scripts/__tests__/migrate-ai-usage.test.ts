/**
 * Guards the path-classification logic of the one-shot ai_usage migration.
 *
 * The dangerous case (gap #3489): an operator sets `CORE_SQLITE_PATH` but
 * fat-fingers it. If the script silently treats that as "no source", the
 * migration is skipped, then core's staged `DROP TABLE` rolls out and the
 * history is gone. These tests pin the contract: explicit + missing must
 * THROW; only an unset/default + missing path may benignly skip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { classifyCorePath, resolveCoreSqlitePath } from '../migrate-ai-usage.js';

describe('classifyCorePath', () => {
  it('migrates when the file exists (explicit path)', () => {
    expect(classifyCorePath({ corePath: '/data/core.db', explicit: true, exists: true })).toEqual({
      action: 'migrate',
    });
  });

  it('migrates when the file exists (default path)', () => {
    expect(classifyCorePath({ corePath: './data/core.db', explicit: false, exists: true })).toEqual(
      { action: 'migrate' }
    );
  });

  it('throws when CORE_SQLITE_PATH is explicit but the file is missing', () => {
    expect(() =>
      classifyCorePath({ corePath: '/tmp/typo-core.db', explicit: true, exists: false })
    ).toThrowError(/CORE_SQLITE_PATH was set to "\/tmp\/typo-core\.db"/);
  });

  it('does NOT skip on an explicit-but-missing path (no benign no-op)', () => {
    let outcome: { action: string } | undefined;
    expect(() => {
      outcome = classifyCorePath({
        corePath: '/tmp/typo-core.db',
        explicit: true,
        exists: false,
      });
    }).toThrow();
    expect(outcome).toBeUndefined();
  });

  it('skips when the path is the unset default and the file is missing', () => {
    expect(
      classifyCorePath({ corePath: './data/core.db', explicit: false, exists: false })
    ).toEqual({
      action: 'skip',
      reason: expect.stringContaining('CORE_SQLITE_PATH unset'),
    });
  });
});

describe('resolveCoreSqlitePath', () => {
  const original = process.env['CORE_SQLITE_PATH'];

  beforeEach(() => {
    delete process.env['CORE_SQLITE_PATH'];
  });

  afterEach(() => {
    if (original === undefined) delete process.env['CORE_SQLITE_PATH'];
    else process.env['CORE_SQLITE_PATH'] = original;
  });

  it('reports the default path as non-explicit when CORE_SQLITE_PATH is unset', () => {
    expect(resolveCoreSqlitePath()).toEqual({
      corePath: './data/core.db',
      explicit: false,
    });
  });

  it('treats an empty CORE_SQLITE_PATH as unset (not explicit)', () => {
    process.env['CORE_SQLITE_PATH'] = '';
    expect(resolveCoreSqlitePath()).toEqual({
      corePath: './data/core.db',
      explicit: false,
    });
  });

  it('reports an explicit path when CORE_SQLITE_PATH is set', () => {
    process.env['CORE_SQLITE_PATH'] = '/data/sqlite/core.db';
    expect(resolveCoreSqlitePath()).toEqual({
      corePath: '/data/sqlite/core.db',
      explicit: true,
    });
  });
});
