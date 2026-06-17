/**
 * Unit tests for the finance cross-pillar reconciliation worker
 * (PRD-251 US-03). The four scenarios spelled out in the PRD's
 * acceptance criteria — happy-path, 404 marks staleAt, owning pillar
 * unavailable, bad URI — are each covered here against a real
 * in-memory finance.db so the SQL behaviour around `markStale` /
 * `clearStale` is exercised end-to-end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { budgets, openFinanceDb, type OpenedFinanceDb } from '../../../db/index.js';
import {
  startReconcileCrossPillarWorker,
  type ReconcileLookupFn,
  type ReconcileLookupResult,
} from '../reconcile-cross-pillar.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

const URI_ALICE = 'pops://core/entities/alice';
const URI_BOB = 'pops://core/entities/bob';
const URI_BAD = 'not-a-uri';

function seedBudget(category: string, ownerUri: string | null): string {
  const id = `b-${category}`;
  opened.db
    .insert(budgets)
    .values({
      id,
      category,
      period: null,
      amount: 100,
      active: 1,
      notes: null,
      lastEditedTime: '2026-01-01T00:00:00Z',
      ownerUri,
    })
    .run();
  return id;
}

function getBudget(id: string): typeof budgets.$inferSelect | undefined {
  return opened.db.select().from(budgets).where(eq(budgets.id, id)).get();
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-reconcile-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('startReconcileCrossPillarWorker (PRD-251 US-03)', () => {
  it('happy path: URI resolves, stale marker stays clear', async () => {
    const id = seedBudget('groceries', URI_ALICE);

    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({ kind: 'ok' });

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(lookup).toHaveBeenCalledWith(URI_ALICE);
    expect(stats.resolved).toBe(1);
    expect(stats.staleMarked).toBe(0);

    const row = getBudget(id);
    expect(row?.ownerUri).toBe(URI_ALICE);
    expect(row?.ownerUriStaleAt).toBeNull();
  });

  it('404: marks staleAt on every row referencing the URI, row is preserved', async () => {
    const aliceId = seedBudget('alice-groceries', URI_ALICE);
    const aliceId2 = seedBudget('alice-fuel', URI_ALICE);
    const bobId = seedBudget('bob-rent', URI_BOB);

    const lookup = vi.fn<ReconcileLookupFn>(async (uri) => {
      if (uri === URI_ALICE) return { kind: 'not-found' };
      return { kind: 'ok' };
    });

    const fakeNow = new Date('2026-06-15T00:00:00.000Z');
    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
      now: () => fakeNow,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.staleMarked).toBe(1);
    expect(stats.resolved).toBe(1);

    const aliceRow = getBudget(aliceId);
    const aliceRow2 = getBudget(aliceId2);
    const bobRow = getBudget(bobId);

    expect(aliceRow?.ownerUriStaleAt).toBe(fakeNow.toISOString());
    expect(aliceRow2?.ownerUriStaleAt).toBe(fakeNow.toISOString());
    expect(bobRow?.ownerUriStaleAt).toBeNull();

    // existence is best-effort — the row is not deleted
    expect(aliceRow).toBeDefined();
    expect(aliceRow2).toBeDefined();
  });

  it('core unavailable: logs warn and no row mutation happens', async () => {
    const id = seedBudget('groceries', URI_ALICE);

    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({
      kind: 'unavailable',
      reason: 'unavailable',
    });
    const warn = vi.fn();

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
      logger: { warn },
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.unavailable).toBe(1);
    expect(stats.staleMarked).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'finance reconcile pillar unavailable',
      expect.objectContaining({ uri: URI_ALICE, reason: 'unavailable' })
    );

    const row = getBudget(id);
    expect(row?.ownerUri).toBe(URI_ALICE);
    expect(row?.ownerUriStaleAt).toBeNull();
  });

  it('bad URI: recorded for ops, row preserved with no stale marker', async () => {
    const id = seedBudget('groceries', URI_BAD);

    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({
      kind: 'bad-uri',
      reason: 'unparseable',
    });
    const warn = vi.fn();

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
      logger: { warn },
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.badUri).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      'finance reconcile bad uri (preserved for ops)',
      expect.objectContaining({ uri: URI_BAD, reason: 'unparseable' })
    );

    const row = getBudget(id);
    expect(row?.ownerUri).toBe(URI_BAD);
    expect(row?.ownerUriStaleAt).toBeNull();
  });

  it('rejected lookup promise is logged and counted as unavailable', async () => {
    const id = seedBudget('groceries', URI_ALICE);

    const lookup = vi.fn<ReconcileLookupFn>().mockRejectedValue(new Error('socket hang up'));
    const warn = vi.fn();

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
      logger: { warn },
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.unavailable).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      'finance reconcile lookup threw',
      expect.objectContaining({ uri: URI_ALICE, error: 'socket hang up' })
    );
    // a thrown lookup must NOT mutate the row — row preserved with no stale marker
    expect(getBudget(id)?.ownerUriStaleAt).toBeNull();
  });

  it('re-resolving a previously stale URI clears the marker', async () => {
    const id = seedBudget('groceries', URI_ALICE);
    opened.db
      .update(budgets)
      .set({ ownerUriStaleAt: '2026-01-01T00:00:00.000Z' })
      .where(eq(budgets.id, id))
      .run();

    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({ kind: 'ok' });

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookupOwnerUri: lookup,
      intervalMs: 1_000_000,
    });
    await handle.runOnce();
    handle.stop();

    expect(getBudget(id)?.ownerUriStaleAt).toBeNull();
  });

  it('reschedules on a recursive setTimeout and stops cleanly', async () => {
    seedBudget('groceries', URI_ALICE);
    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({
      kind: 'ok',
    } satisfies ReconcileLookupResult);

    vi.useFakeTimers();
    try {
      const handle = startReconcileCrossPillarWorker({
        db: opened.db,
        lookupOwnerUri: lookup,
        intervalMs: 1_000,
      });

      await vi.runOnlyPendingTimersAsync();
      const firstCount = lookup.mock.calls.length;
      expect(firstCount).toBeGreaterThanOrEqual(1);

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      const beforeStop = lookup.mock.calls.length;
      expect(beforeStop).toBeGreaterThan(firstCount);

      handle.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(lookup.mock.calls.length).toBe(beforeStop);
    } finally {
      vi.useRealTimers();
    }
  });
});
