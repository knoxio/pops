/**
 * Unit tests for the inventory cross-pillar URI reconciliation cron
 * (PRD-251 US-01 + US-02).
 *
 * Coverage matches the PRD's acceptance criteria — happy-path, 404,
 * owning-pillar-unavailable, bad-URI — and the timer-based scheduling
 * path that arms the next tick after the current one settles.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  crossPillarUrisService,
  homeInventory,
  openInventoryDb,
  type OpenedInventoryDb,
} from '@pops/inventory-db';
import { PillarCallError, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  parseSoftUri,
  runReconciliation,
  startCrossPillarReconciliationWorker,
} from '../reconcile-cross-pillar.js';

import type { CoreRouter } from '@pops/core-contract';
import type { FinanceRouter } from '@pops/finance-contract';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

const FROZEN_NOW = new Date('2026-06-15T03:30:00.000Z');

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-cron-reconcile-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface SeededRow {
  id: string;
  purchaseTransactionUri?: string | null;
  ownerUri?: string | null;
}

function seedRow(row: SeededRow): void {
  inventoryDb.db
    .insert(homeInventory)
    .values({
      id: row.id,
      itemName: `item-${row.id}`,
      lastEditedTime: FROZEN_NOW.toISOString(),
      purchaseTransactionUri: row.purchaseTransactionUri ?? null,
      ownerUri: row.ownerUri ?? null,
    })
    .run();
}

function readRow(id: string): {
  purchaseTransactionStaleAt: string | null;
  ownerStaleAt: string | null;
} {
  const rows = inventoryDb.db
    .select({
      id: homeInventory.id,
      purchaseTransactionStaleAt: homeInventory.purchaseTransactionStaleAt,
      ownerStaleAt: homeInventory.ownerStaleAt,
    })
    .from(homeInventory)
    .where(eq(homeInventory.id, id))
    .all();
  const row = rows[0];
  if (!row) throw new Error(`row ${id} not found`);
  return {
    purchaseTransactionStaleAt: row.purchaseTransactionStaleAt,
    ownerStaleAt: row.ownerStaleAt,
  };
}

interface FakeFinanceCall {
  result?: CallResult<unknown>;
  error?: unknown;
}

interface FakeCoreCall {
  result?: CallResult<unknown>;
  error?: unknown;
}

function makeFinanceProxy(byId: Record<string, FakeFinanceCall>): PillarHandle<FinanceRouter> {
  const fake = {
    callDynamic: vi.fn(
      async (
        _routerName: string,
        _procName: string,
        input?: unknown
      ): Promise<CallResult<unknown>> => {
        const id = (input as { id: string } | undefined)?.id ?? '';
        const slot = byId[id];
        if (!slot) {
          return { kind: 'not-found', pillar: 'finance' };
        }
        if (slot.error) throw slot.error;
        if (slot.result) return slot.result;
        return { kind: 'ok', value: { data: { id } } };
      }
    ),
  };
  return fake as unknown as PillarHandle<FinanceRouter>;
}

function makeCoreProxy(byUri: Record<string, FakeCoreCall>): PillarHandle<CoreRouter> {
  const fake = {
    callDynamic: vi.fn(
      async (
        _routerName: string,
        _procName: string,
        input?: unknown
      ): Promise<CallResult<unknown>> => {
        const uri = (input as { uri: string } | undefined)?.uri ?? '';
        const slot = byUri[uri];
        if (!slot) {
          return { kind: 'not-found', pillar: 'core' };
        }
        if (slot.error) throw slot.error;
        if (slot.result) return slot.result;
        return { kind: 'ok', value: { data: { uri } } };
      }
    ),
  };
  return fake as unknown as PillarHandle<CoreRouter>;
}

describe('parseSoftUri', () => {
  it('parses a well-formed soft URI', () => {
    expect(parseSoftUri('pops://finance/transaction/abc-123')).toEqual({
      pillar: 'finance',
      type: 'transaction',
      id: 'abc-123',
    });
  });

  it('returns null for malformed URIs', () => {
    expect(parseSoftUri('http://finance/transaction/x')).toBeNull();
    expect(parseSoftUri('pops://finance/transaction/')).toBeNull();
    expect(parseSoftUri('pops://finance')).toBeNull();
    expect(parseSoftUri('not a uri at all')).toBeNull();
  });

  it('preserves slashes in the id segment (urn-style)', () => {
    expect(parseSoftUri('pops://core/user/joe@example.com')).toEqual({
      pillar: 'core',
      type: 'user',
      id: 'joe@example.com',
    });
  });
});

describe('runReconciliation — happy-path', () => {
  it('clears stale markers when the owning pillar resolves', async () => {
    seedRow({
      id: 'row-1',
      purchaseTransactionUri: 'pops://finance/transaction/tx-1',
      ownerUri: 'pops://core/user/joao@example.com',
    });
    crossPillarUrisService.markPurchaseTransactionUriStale(
      inventoryDb.db,
      'pops://finance/transaction/tx-1',
      '2026-06-14T00:00:00.000Z'
    );
    crossPillarUrisService.markOwnerUriStale(
      inventoryDb.db,
      'pops://core/user/joao@example.com',
      '2026-06-14T00:00:00.000Z'
    );

    const finance = makeFinanceProxy({ 'tx-1': {} });
    const core = makeCoreProxy({ 'pops://core/user/joao@example.com': {} });
    const info = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
      logger: { info },
    });

    expect(counters).toEqual({ ok: 2, notFound: 0, unavailable: 0, badUri: 0 });
    const after = readRow('row-1');
    expect(after.purchaseTransactionStaleAt).toBeNull();
    expect(after.ownerStaleAt).toBeNull();
    expect(info).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation complete',
      expect.objectContaining({ ok: 2 })
    );
  });
});

describe('runReconciliation — 404', () => {
  it('stamps staleAt + preserves the row on not-found', async () => {
    seedRow({
      id: 'row-2',
      purchaseTransactionUri: 'pops://finance/transaction/missing',
      ownerUri: 'pops://core/user/nobody@example.com',
    });
    const finance = makeFinanceProxy({});
    const core = makeCoreProxy({});
    const info = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
      logger: { info },
    });

    expect(counters).toEqual({ ok: 0, notFound: 2, unavailable: 0, badUri: 0 });
    const after = readRow('row-2');
    expect(after.purchaseTransactionStaleAt).toBe(FROZEN_NOW.toISOString());
    expect(after.ownerStaleAt).toBe(FROZEN_NOW.toISOString());

    const stillThere = inventoryDb.db.select().from(homeInventory).all();
    expect(stillThere).toHaveLength(1);
  });

  it('treats a PillarCallError(not-found) the same as a CallResult not-found', async () => {
    seedRow({
      id: 'row-2b',
      purchaseTransactionUri: 'pops://finance/transaction/raise-404',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(async () => {
        throw new PillarCallError('finance', { kind: 'not-found', pillar: 'finance' });
      }),
    } as unknown as PillarHandle<FinanceRouter>;
    const core = makeCoreProxy({});

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
    });

    expect(counters.notFound).toBe(1);
    const after = readRow('row-2b');
    expect(after.purchaseTransactionStaleAt).toBe(FROZEN_NOW.toISOString());
  });
});

describe('runReconciliation — owning-pillar-unavailable', () => {
  it('logs + leaves the row untouched on unavailable', async () => {
    seedRow({
      id: 'row-3',
      purchaseTransactionUri: 'pops://finance/transaction/tx-3',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(
        async (): Promise<CallResult<unknown>> => ({ kind: 'unavailable', pillar: 'finance' })
      ),
    } as unknown as PillarHandle<FinanceRouter>;
    const core = makeCoreProxy({});
    const warn = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
      logger: { warn },
    });

    expect(counters).toEqual({ ok: 0, notFound: 0, unavailable: 1, badUri: 0 });
    const after = readRow('row-3');
    expect(after.purchaseTransactionStaleAt).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: owning pillar unavailable',
      expect.objectContaining({ uri: 'pops://finance/transaction/tx-3' })
    );
  });

  it('treats a thrown non-Pillar error as unavailable (retry next tick)', async () => {
    seedRow({
      id: 'row-3b',
      ownerUri: 'pops://core/user/transient@example.com',
    });
    const finance = makeFinanceProxy({});
    const core: PillarHandle<CoreRouter> = {
      callDynamic: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    } as unknown as PillarHandle<CoreRouter>;

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
    });

    expect(counters.unavailable).toBe(1);
    const after = readRow('row-3b');
    expect(after.ownerStaleAt).toBeNull();
  });
});

describe('runReconciliation — bad-URI', () => {
  it('records unparseable URIs for ops without touching the row', async () => {
    seedRow({
      id: 'row-4',
      purchaseTransactionUri: 'not-a-valid-uri',
      ownerUri: 'pops://core/wrong-type/foo',
    });
    const finance = makeFinanceProxy({});
    const core = makeCoreProxy({});
    const warn = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
      logger: { warn },
    });

    expect(counters).toEqual({ ok: 0, notFound: 0, unavailable: 0, badUri: 2 });
    const after = readRow('row-4');
    expect(after.purchaseTransactionStaleAt).toBeNull();
    expect(after.ownerStaleAt).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: bad uri (unparseable / wrong shape)',
      expect.objectContaining({ uri: 'not-a-valid-uri' })
    );
  });

  it('treats a CallResult bad-request from the owning pillar as bad URI', async () => {
    seedRow({
      id: 'row-4b',
      purchaseTransactionUri: 'pops://finance/transaction/refused',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(
        async (): Promise<CallResult<unknown>> => ({
          kind: 'bad-request',
          pillar: 'finance',
          message: 'no such id format',
        })
      ),
    } as unknown as PillarHandle<FinanceRouter>;
    const core = makeCoreProxy({});

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance, core },
    });

    expect(counters.badUri).toBe(1);
  });
});

describe('startCrossPillarReconciliationWorker', () => {
  it('runs reconciliation immediately, then reschedules at intervalMs', async () => {
    seedRow({
      id: 'row-5',
      purchaseTransactionUri: 'pops://finance/transaction/tx-5',
    });
    const finance = makeFinanceProxy({ 'tx-5': {} });
    const core = makeCoreProxy({});

    const handle = startCrossPillarReconciliationWorker({
      db: inventoryDb.db,
      intervalMs: 60_000,
      proxies: { finance, core },
    });

    await vi.advanceTimersByTimeAsync(0);
    const afterImmediate = finance.callDynamic.mock.calls.length;
    expect(afterImmediate).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(finance.callDynamic.mock.calls.length).toBeGreaterThan(afterImmediate);

    const beforeStop = finance.callDynamic.mock.calls.length;
    handle.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(finance.callDynamic).toHaveBeenCalledTimes(beforeStop);
  });
});
