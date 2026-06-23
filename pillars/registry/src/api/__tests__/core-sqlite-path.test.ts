/**
 * Resolver tests — guards the precedence chain so future pillar work
 * doesn't accidentally drift the registry-api away from the shared
 * resolver, and pins the core→registry rename window (REGISTRY_SQLITE_PATH
 * wins, CORE_SQLITE_PATH still honoured until the box DB rename lands).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRY_SQLITE_PATH, resolveCoreSqlitePath } from '../core-sqlite-path.js';

const originalRegistryPath = process.env['REGISTRY_SQLITE_PATH'];
const originalCorePath = process.env['CORE_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['REGISTRY_SQLITE_PATH'];
  delete process.env['CORE_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalRegistryPath === undefined) delete process.env['REGISTRY_SQLITE_PATH'];
  else process.env['REGISTRY_SQLITE_PATH'] = originalRegistryPath;
  if (originalCorePath === undefined) delete process.env['CORE_SQLITE_PATH'];
  else process.env['CORE_SQLITE_PATH'] = originalCorePath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveCoreSqlitePath', () => {
  it('returns REGISTRY_SQLITE_PATH verbatim when set', () => {
    process.env['REGISTRY_SQLITE_PATH'] = '/abs/path/registry.db';
    expect(resolveCoreSqlitePath()).toBe('/abs/path/registry.db');
  });

  it('prefers REGISTRY_SQLITE_PATH over the legacy CORE_SQLITE_PATH', () => {
    process.env['REGISTRY_SQLITE_PATH'] = '/new/registry.db';
    process.env['CORE_SQLITE_PATH'] = '/old/core.db';
    expect(resolveCoreSqlitePath()).toBe('/new/registry.db');
  });

  it('still honours CORE_SQLITE_PATH during the rename window when REGISTRY_SQLITE_PATH is unset', () => {
    process.env['CORE_SQLITE_PATH'] = '/abs/path/core.db';
    expect(resolveCoreSqlitePath()).toBe('/abs/path/core.db');
  });

  it('derives <dirname(SQLITE_PATH)>/registry.db when no explicit path is set', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveCoreSqlitePath()).toBe('/opt/pops/data/registry.db');
  });

  it('handles a relative SQLITE_PATH', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveCoreSqlitePath()).toBe('data/registry.db');
  });

  it('falls back to ./data/registry.db when no env is set', () => {
    expect(resolveCoreSqlitePath()).toBe(DEFAULT_REGISTRY_SQLITE_PATH);
    expect(DEFAULT_REGISTRY_SQLITE_PATH).toBe('./data/registry.db');
  });
});
