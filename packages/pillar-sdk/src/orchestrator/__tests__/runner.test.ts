import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ADAPTER_TIMEOUT_MS,
  EmptyFederatedQueryError,
  runFederatedSearch,
} from '../runner.js';
import { snapshot } from './fixtures.js';

import type { ScoredResult } from '../../ranking/types.js';
import type { FederatedSearchQuery, PillarAdapterTarget, SearchAdapterInvoker } from '../types.js';

function result(score: number, entityName: string): ScoredResult {
  return { score, entityName, data: { entityName } };
}

function makeInvoker(
  handlers: Record<string, (query: FederatedSearchQuery) => Promise<readonly ScoredResult[]>>
): SearchAdapterInvoker {
  return (target, query) => {
    const key = `${target.pillarId}/${target.adapterName}`;
    const handler = handlers[key];
    if (handler === undefined) throw new Error(`no handler registered for ${key}`);
    return handler(query);
  };
}

describe('runFederatedSearch', () => {
  it('rejects an empty query (no text, tags, or dateRange)', async () => {
    await expect(
      runFederatedSearch({
        query: {},
        invoker: () => Promise.resolve([]),
        discovery: [],
      })
    ).rejects.toBeInstanceOf(EmptyFederatedQueryError);
  });

  it('rejects whitespace-only text without other dimensions', async () => {
    await expect(
      runFederatedSearch({
        query: { text: '   ' },
        invoker: () => Promise.resolve([]),
        discovery: [],
      })
    ).rejects.toBeInstanceOf(EmptyFederatedQueryError);
  });

  it.each([
    ['text', { text: 'pizza' } satisfies FederatedSearchQuery],
    ['tags', { tags: ['groceries'] } satisfies FederatedSearchQuery],
    [
      'dateRange',
      {
        dateRange: { from: new Date('2026-01-01'), to: new Date('2026-02-01') },
      } satisfies FederatedSearchQuery,
    ],
  ])('accepts a query with just %s', async (_label, query) => {
    const response = await runFederatedSearch({
      query,
      invoker: () => Promise.resolve([]),
      discovery: [],
    });

    expect(response.results).toEqual([]);
    expect(response.failures).toEqual([]);
  });

  it('fans out to every registered pillar that advertises an adapter', async () => {
    const calls: PillarAdapterTarget[] = [];
    const invoker: SearchAdapterInvoker = (target) => {
      calls.push(target);
      return Promise.resolve([result(1, `${target.pillarId}-${target.adapterName}`)]);
    };

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions', 'budgets']), snapshot('media', ['movies'])],
    });

    expect(calls.map((c) => `${c.pillarId}/${c.adapterName}`)).toEqual([
      'finance/transactions',
      'finance/budgets',
      'media/movies',
    ]);
    expect(response.results).toHaveLength(3);
    expect(response.failures).toEqual([]);
  });

  it('skips unregistered pillars', async () => {
    const calls: PillarAdapterTarget[] = [];
    const invoker: SearchAdapterInvoker = (target) => {
      calls.push(target);
      return Promise.resolve([]);
    };

    await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'], false)],
    });

    expect(calls.map((c) => c.pillarId)).toEqual(['finance']);
  });

  it('skips pillars without any adapters declared', async () => {
    const calls: PillarAdapterTarget[] = [];
    const invoker: SearchAdapterInvoker = (target) => {
      calls.push(target);
      return Promise.resolve([]);
    };

    await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', []), snapshot('media', ['movies'])],
    });

    expect(calls.map((c) => c.pillarId)).toEqual(['media']);
  });

  it('honours the pillars allow-list', async () => {
    const calls: PillarAdapterTarget[] = [];
    const invoker: SearchAdapterInvoker = (target) => {
      calls.push(target);
      return Promise.resolve([]);
    };

    await runFederatedSearch({
      query: { text: 'pizza', pillars: ['media'] },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(calls.map((c) => c.pillarId)).toEqual(['media']);
  });

  it('merges per-pillar results via the ranking strategy', async () => {
    const invoker = makeInvoker({
      'finance/transactions': async () => [result(10, 'tx-1'), result(5, 'tx-2')],
      'media/movies': async () => [result(0.5, 'movie-A')],
    });

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.results.map((r) => r.entityName)).toEqual(['tx-1', 'movie-A', 'tx-2']);
    expect(response.results[0]?.adjustedScore).toBe(1);
    expect(response.results[1]?.adjustedScore).toBe(1);
    expect(response.results[2]?.adjustedScore).toBe(0.5);
  });

  it('forwards limit and weights to the merge step', async () => {
    const invoker = makeInvoker({
      'finance/transactions': async () => [result(10, 'tx-1'), result(5, 'tx-2')],
      'media/movies': async () => [result(0.5, 'movie-A')],
    });

    const response = await runFederatedSearch({
      query: { text: 'pizza', limit: 2 },
      weights: new Map([
        ['finance', 0.5],
        ['media', 2],
      ]),
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.pillarId).toBe('media');
    expect(response.results[0]?.adjustedScore).toBe(2);
  });

  it('collects failures via Promise.allSettled instead of rejecting', async () => {
    const invoker = makeInvoker({
      'finance/transactions': async () => [result(1, 'tx-1')],
      'media/movies': async () => {
        throw new Error('boom');
      },
    });

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.results.map((r) => r.entityName)).toEqual(['tx-1']);
    expect(response.failures).toEqual([
      {
        pillarId: 'media',
        adapterName: 'movies',
        reason: 'error',
        error: expect.objectContaining({ message: 'boom' }),
      },
    ]);
  });

  it('classifies timeouts separately from generic errors', async () => {
    vi.useFakeTimers();
    try {
      const invoker: SearchAdapterInvoker = (target, _query, signal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          if (target.pillarId === 'finance') {
            resolve([result(1, 'fast-tx')]);
          }
        });

      const promise = runFederatedSearch({
        query: { text: 'pizza' },
        invoker,
        timeoutMs: 100,
        discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
      });

      await vi.advanceTimersByTimeAsync(101);
      const response = await promise;

      expect(response.results.map((r) => r.entityName)).toEqual(['fast-tx']);
      expect(response.failures).toEqual([
        { pillarId: 'media', adapterName: 'movies', reason: 'timeout' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns empty results + per-target failures when every adapter times out', async () => {
    vi.useFakeTimers();
    try {
      const invoker: SearchAdapterInvoker = () => new Promise(() => {});

      const promise = runFederatedSearch({
        query: { text: 'pizza' },
        invoker,
        timeoutMs: 50,
        discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
      });

      await vi.advanceTimersByTimeAsync(51);
      const response = await promise;

      expect(response.results).toEqual([]);
      expect(response.failures).toEqual([
        { pillarId: 'finance', adapterName: 'transactions', reason: 'timeout' },
        { pillarId: 'media', adapterName: 'movies', reason: 'timeout' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns and ignores non-array adapter results', async () => {
    const warn = vi.fn();
    const invoker: SearchAdapterInvoker = () =>
      Promise.resolve('totally not an array' as unknown as readonly ScoredResult[]);

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      onWarn: warn,
      discovery: [snapshot('finance', ['transactions'])],
    });

    expect(response.results).toEqual([]);
    expect(response.failures).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('finance/transactions'));
  });

  it('accepts a discovery fetcher function', async () => {
    const invoker = makeInvoker({
      'finance/transactions': async () => [result(1, 'tx-1')],
    });

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: () => Promise.resolve([snapshot('finance', ['transactions'])]),
    });

    expect(response.results.map((r) => r.entityName)).toEqual(['tx-1']);
  });

  it('exposes a 3s default timeout per PRD-197', () => {
    expect(DEFAULT_ADAPTER_TIMEOUT_MS).toBe(3_000);
  });

  it('aborts the per-adapter signal once the adapter resolves', async () => {
    const seen: AbortSignal[] = [];
    const invoker: SearchAdapterInvoker = (_target, _query, signal) => {
      seen.push(signal);
      return Promise.resolve([result(1, 'a')]);
    };

    await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions'])],
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.aborted).toBe(true);
  });
});
