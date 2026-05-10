/**
 * End-to-end tests for `core.uri.resolve` (PRD-101 US-08).
 *
 * Exercises the full path: tRPC caller -> dispatcher -> per-module URI
 * handler -> service-layer get against a real test database. Each module
 * (finance, media, inventory) gets a "resolve when present" and "not-found
 * when missing" pair; the install-gating case asserts the closing-#2522
 * acceptance criterion that an absent-module URI returns a typed placeholder
 * rather than an exception.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  seedBudget,
  seedEntity,
  seedInventoryItem,
  seedLocation,
  seedMovie,
  seedTransaction,
  seedTvShow,
  setupTestContext,
} from '../../../shared/test-utils.js';
import { __resetInstalledModulesCache } from '../../env-modules.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

const APP_KEY = 'POPS_APPS';
const OVERLAY_KEY = 'POPS_OVERLAYS';
let originalApps: string | undefined;
let originalOverlays: string | undefined;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
  originalApps = process.env[APP_KEY];
  originalOverlays = process.env[OVERLAY_KEY];
  __resetInstalledModulesCache();
});

afterEach(() => {
  ctx.teardown();
  if (originalApps === undefined) delete process.env[APP_KEY];
  else process.env[APP_KEY] = originalApps;
  if (originalOverlays === undefined) delete process.env[OVERLAY_KEY];
  else process.env[OVERLAY_KEY] = originalOverlays;
  __resetInstalledModulesCache();
});

describe('core.uri.resolve — finance', () => {
  it('resolves a transaction URI to the transaction row', async () => {
    seedEntity(db, { id: 'ent-1', name: 'Coffee Shop' });
    const txId = 'tx-1';
    seedTransaction(db, { id: txId, description: 'Coffee', amount: 4.5 });

    const result = await caller.core.uri.resolve({ uri: `pops:finance/transaction/${txId}` });

    expect(result.kind).toBe('object');
    if (result.kind === 'object') {
      expect(result.moduleId).toBe('finance');
      expect(result.type).toBe('transaction');
      expect(result.id).toBe(txId);
    }
  });

  it('resolves an entity URI', async () => {
    const id = seedEntity(db, { name: 'ACME Pty Ltd' });
    const result = await caller.core.uri.resolve({ uri: `pops:finance/entity/${id}` });
    expect(result.kind).toBe('object');
  });

  it('resolves a budget URI', async () => {
    const id = seedBudget(db, { category: 'Groceries' });
    const result = await caller.core.uri.resolve({ uri: `pops:finance/budget/${id}` });
    expect(result.kind).toBe('object');
  });

  it('returns not-found for a missing transaction id', async () => {
    const result = await caller.core.uri.resolve({
      uri: 'pops:finance/transaction/does-not-exist',
    });
    expect(result).toEqual({
      kind: 'not-found',
      moduleId: 'finance',
      type: 'transaction',
      id: 'does-not-exist',
    });
  });
});

describe('core.uri.resolve — media', () => {
  it('resolves a movie URI', async () => {
    const id = seedMovie(db, { title: 'Inception' });
    const result = await caller.core.uri.resolve({ uri: `pops:media/movie/${id}` });
    expect(result.kind).toBe('object');
  });

  it('resolves a tv-show URI', async () => {
    const id = seedTvShow(db, { name: 'Breaking Bad' });
    const result = await caller.core.uri.resolve({ uri: `pops:media/tv-show/${id}` });
    expect(result.kind).toBe('object');
  });

  it('returns not-found for a missing movie id', async () => {
    const result = await caller.core.uri.resolve({ uri: 'pops:media/movie/999999' });
    expect(result.kind).toBe('not-found');
  });

  it('returns not-found for a non-numeric movie id (per-handler shape constraint)', async () => {
    const result = await caller.core.uri.resolve({ uri: 'pops:media/movie/abc' });
    expect(result.kind).toBe('not-found');
  });
});

describe('core.uri.resolve — inventory', () => {
  it('resolves an item URI', async () => {
    const id = seedInventoryItem(db, { item_name: 'Vacuum' });
    const result = await caller.core.uri.resolve({ uri: `pops:inventory/item/${id}` });
    expect(result.kind).toBe('object');
  });

  it('resolves a location URI', async () => {
    const id = seedLocation(db, { name: 'Garage' });
    const result = await caller.core.uri.resolve({ uri: `pops:inventory/location/${id}` });
    expect(result.kind).toBe('object');
  });

  it('returns not-found for a missing item id', async () => {
    const result = await caller.core.uri.resolve({ uri: 'pops:inventory/item/missing' });
    expect(result.kind).toBe('not-found');
  });
});

describe('core.uri.resolve — module-absent', () => {
  it('returns module-absent when the owning module is not installed', async () => {
    process.env[APP_KEY] = 'finance';
    // Clear overlays explicitly so a pre-existing host env value can't make
    // this test pass for the wrong reason.
    process.env[OVERLAY_KEY] = '';
    __resetInstalledModulesCache();
    // Re-create caller so the new env propagates through the gate.
    const restrictedCaller = createCaller(true);

    const result = await restrictedCaller.core.uri.resolve({
      uri: 'pops:media/movie/42',
    });

    expect(result).toEqual({ kind: 'module-absent', moduleId: 'media' });
  });
});

describe('core.uri.resolve — malformed', () => {
  it('returns malformed for a non-pops URI', async () => {
    const result = await caller.core.uri.resolve({ uri: 'http://example.com' });
    expect(result.kind).toBe('malformed');
    if (result.kind === 'malformed') {
      expect(result.uri).toBe('http://example.com');
      expect(result.reason).toMatch(/pops:/);
    }
  });

  it('returns malformed for a URI with too few segments', async () => {
    const result = await caller.core.uri.resolve({ uri: 'pops:finance/transaction' });
    expect(result.kind).toBe('malformed');
  });

  it('returns malformed for an uppercase moduleId', async () => {
    const result = await caller.core.uri.resolve({ uri: 'pops:Finance/transaction/1' });
    expect(result.kind).toBe('malformed');
  });
});
