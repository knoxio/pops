/**
 * Unit tests for the pillar smoke harness primitives. Exercise the
 * reflection + dispatch + ignore + missing-table heuristics against a
 * hand-rolled fake router/caller so the harness itself can't quietly
 * miss a regression of its own.
 */
import { describe, expect, it } from 'vitest';

import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type ReflectableCaller,
  type ReflectableRouter,
} from './pillar-smoke-harness.js';

function makeRouter(types: Record<string, 'query' | 'mutation'>): ReflectableRouter {
  const procedures: Record<string, unknown> = {};
  for (const [path, type] of Object.entries(types)) {
    procedures[path] = { _def: { type } };
  }
  return { _def: { procedures } };
}

function makeCaller(handlers: Record<string, (input: unknown) => unknown>): ReflectableCaller {
  const root: Record<string, unknown> = {};
  for (const [path, handler] of Object.entries(handlers)) {
    const segments = path.split('.');
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      const existing = cursor[seg];
      if (existing === undefined) {
        const next: Record<string, unknown> = {};
        cursor[seg] = next;
        cursor = next;
      } else if (typeof existing === 'object' && existing !== null) {
        cursor = existing as Record<string, unknown>;
      }
    }
    cursor[segments[segments.length - 1]!] = handler;
  }
  return root as ReflectableCaller;
}

describe('enumeratePillarQueries', () => {
  const router = makeRouter({
    'finance.transactions.list': 'query',
    'finance.transactions.create': 'mutation',
    'finance.budgets.list': 'query',
    'core.entities.list': 'query',
  });

  it('returns only queries matching the pillar prefix', () => {
    expect(enumeratePillarQueries(router, 'finance')).toEqual([
      'finance.budgets.list',
      'finance.transactions.list',
    ]);
  });

  it('returns an empty array for a pillar with no procedures', () => {
    expect(enumeratePillarQueries(router, 'media')).toEqual([]);
  });

  it('does not match a pillar prefix that is a partial-segment substring', () => {
    const partial = makeRouter({
      'financeAdjacent.list': 'query',
      'finance.budgets.list': 'query',
    });
    expect(enumeratePillarQueries(partial, 'finance')).toEqual(['finance.budgets.list']);
  });
});

describe('runPillarSmokeHarness', () => {
  const router = makeRouter({
    'finance.wishlist.list': 'query',
    'finance.budgets.list': 'query',
    'finance.transactions.list': 'query',
  });

  it('returns no failures when every handler resolves', async () => {
    const caller = makeCaller({
      'finance.wishlist.list': () => ({ data: [] }),
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    const failures = await runPillarSmokeHarness(router, caller, 'finance');
    expect(failures).toEqual([]);
  });

  it('records a failure when a handler throws `no such table`', async () => {
    const caller = makeCaller({
      'finance.wishlist.list': () => {
        throw new Error('SqliteError: no such table: wish_list');
      },
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    const failures = await runPillarSmokeHarness(router, caller, 'finance');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.path).toBe('finance.wishlist.list');
    expect(failures[0]?.message).toMatch(/no such table: wish_list/);
  });

  it('records `no such table` when surfaced via err.cause (drizzle wrap)', async () => {
    const cause = new Error('SqliteError: no such table: budgets');
    const wrapped = new Error('TRPCError');
    (wrapped as { cause?: unknown }).cause = cause;
    const caller = makeCaller({
      'finance.wishlist.list': () => ({ data: [] }),
      'finance.budgets.list': () => {
        throw wrapped;
      },
      'finance.transactions.list': () => ({ data: [] }),
    });
    const failures = await runPillarSmokeHarness(router, caller, 'finance');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.path).toBe('finance.budgets.list');
  });

  it('does NOT record non-table errors (validation, not-found, ...)', async () => {
    const caller = makeCaller({
      'finance.wishlist.list': () => {
        throw new Error('Validation error: invalid input');
      },
      'finance.budgets.list': () => {
        throw new Error('NOT_FOUND');
      },
      'finance.transactions.list': () => {
        const e = new Error('TRPCError: PARSE_ERROR');
        return Promise.reject(e);
      },
    });
    const failures = await runPillarSmokeHarness(router, caller, 'finance');
    expect(failures).toEqual([]);
  });

  it('honours ignorePaths — listed paths are skipped entirely', async () => {
    const caller = makeCaller({
      'finance.wishlist.list': () => {
        throw new Error('no such table: wish_list');
      },
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    const failures = await runPillarSmokeHarness(router, caller, 'finance', {
      ignorePaths: new Set(['finance.wishlist.list']),
    });
    expect(failures).toEqual([]);
  });

  it('threads input from the inputs map to the handler', async () => {
    let captured: unknown = null;
    const caller = makeCaller({
      'finance.wishlist.list': (input: unknown) => {
        captured = input;
        return { data: [] };
      },
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    await runPillarSmokeHarness(router, caller, 'finance', {
      inputs: { 'finance.wishlist.list': { id: 'probe-id' } },
    });
    expect(captured).toEqual({ id: 'probe-id' });
  });

  it('defaults missing input map entries to `{}`', async () => {
    let captured: unknown = null;
    const caller = makeCaller({
      'finance.wishlist.list': (input: unknown) => {
        captured = input;
        return { data: [] };
      },
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    await runPillarSmokeHarness(router, caller, 'finance');
    expect(captured).toEqual({});
  });

  it('silently swallows handlers that hang past the per-procedure timeout', async () => {
    const caller = makeCaller({
      'finance.wishlist.list': () => new Promise(() => {}),
      'finance.budgets.list': () => ({ data: [] }),
      'finance.transactions.list': () => ({ data: [] }),
    });
    const started = Date.now();
    const failures = await runPillarSmokeHarness(router, caller, 'finance');
    const elapsed = Date.now() - started;
    expect(failures).toEqual([]);
    expect(elapsed).toBeLessThan(1500);
  });
});
