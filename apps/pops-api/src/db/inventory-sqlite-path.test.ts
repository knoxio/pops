/**
 * Resolver tests for the inventory pillar's SQLite path.
 *
 * Covers the precedence chain: INVENTORY_SQLITE_PATH > <dirname(SQLITE_PATH)>/inventory.db > fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_INVENTORY_SQLITE_PATH,
  resolveInventorySqlitePath,
} from './inventory-sqlite-path.js';

const originalInventoryPath = process.env['INVENTORY_SQLITE_PATH'];
const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  delete process.env['INVENTORY_SQLITE_PATH'];
  delete process.env['SQLITE_PATH'];
});

afterEach(() => {
  if (originalInventoryPath === undefined) delete process.env['INVENTORY_SQLITE_PATH'];
  else process.env['INVENTORY_SQLITE_PATH'] = originalInventoryPath;
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

describe('resolveInventorySqlitePath', () => {
  it('returns INVENTORY_SQLITE_PATH verbatim when set', () => {
    process.env['INVENTORY_SQLITE_PATH'] = '/abs/path/inventory.db';
    expect(resolveInventorySqlitePath()).toBe('/abs/path/inventory.db');
  });

  it('derives the path from the shared SQLITE_PATH when INVENTORY_SQLITE_PATH is unset', () => {
    process.env['SQLITE_PATH'] = '/opt/pops/data/pops.db';
    expect(resolveInventorySqlitePath()).toBe('/opt/pops/data/inventory.db');
  });

  it('handles relative SQLITE_PATH values', () => {
    process.env['SQLITE_PATH'] = './data/pops.db';
    expect(resolveInventorySqlitePath()).toBe('data/inventory.db');
  });

  it('falls back to ./data/inventory.db when neither env is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(resolveInventorySqlitePath()).toBe(DEFAULT_INVENTORY_SQLITE_PATH);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
