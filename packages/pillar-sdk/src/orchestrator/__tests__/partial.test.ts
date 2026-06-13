import { describe, expect, it, vi } from 'vitest';

import { summarisePartialFailures } from '../partial.js';
import { runFederatedSearch } from '../runner.js';
import { snapshot } from './fixtures.js';

import type { ScoredResult } from '../../ranking/types.js';
import type {
  FederatedSearchFailure,
  PillarAdapterTarget,
  SearchAdapterInvoker,
} from '../types.js';

function result(score: number, entityName: string): ScoredResult {
  return { score, entityName, data: { entityName } };
}

const target = (pillarId: string, adapterName: string): PillarAdapterTarget => ({
  pillarId,
  adapterName,
  procedurePath: `${pillarId}.routerA.${adapterName}`,
});

describe('summarisePartialFailures', () => {
  it('returns empty failure arrays when no failures were recorded', () => {
    const summary = summarisePartialFailures(
      [target('finance', 'transactions'), target('media', 'movies')],
      []
    );

    expect(summary).toEqual({
      requestedPillars: ['finance', 'media'],
      respondedPillars: ['finance', 'media'],
      failedPillars: [],
      timeoutPillars: [],
    });
  });

  it('dedupes pillars across multiple adapters when building requestedPillars', () => {
    const summary = summarisePartialFailures(
      [target('finance', 'transactions'), target('finance', 'budgets'), target('media', 'movies')],
      []
    );

    expect(summary.requestedPillars).toEqual(['finance', 'media']);
    expect(summary.respondedPillars).toEqual(['finance', 'media']);
  });

  it('preserves the fan-out order in requestedPillars', () => {
    const summary = summarisePartialFailures(
      [target('media', 'movies'), target('finance', 'transactions')],
      []
    );

    expect(summary.requestedPillars).toEqual(['media', 'finance']);
  });

  it('reports a pillar as failed when one of its adapters threw', () => {
    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'error', error: new Error('boom') },
    ];

    const summary = summarisePartialFailures(
      [target('finance', 'transactions'), target('media', 'movies')],
      failures
    );

    expect(summary.failedPillars).toEqual([{ pillar: 'media', reason: 'boom' }]);
    expect(summary.respondedPillars).toEqual(['finance']);
    expect(summary.timeoutPillars).toEqual([]);
  });

  it('reports a pillar as timed-out when one of its adapters hit the per-adapter timeout', () => {
    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'timeout' },
    ];

    const summary = summarisePartialFailures(
      [target('finance', 'transactions'), target('media', 'movies')],
      failures
    );

    expect(summary.timeoutPillars).toEqual(['media']);
    expect(summary.failedPillars).toEqual([]);
    expect(summary.respondedPillars).toEqual(['finance']);
  });

  it('prefers the timeout classification when a pillar has both timeout and error adapters', () => {
    const failures: FederatedSearchFailure[] = [
      {
        pillarId: 'media',
        adapterName: 'movies',
        reason: 'error',
        error: new Error('first adapter boom'),
      },
      { pillarId: 'media', adapterName: 'shows', reason: 'timeout' },
    ];

    const summary = summarisePartialFailures(
      [target('media', 'movies'), target('media', 'shows')],
      failures
    );

    expect(summary.timeoutPillars).toEqual(['media']);
    expect(summary.failedPillars).toEqual([]);
    expect(summary.respondedPillars).toEqual([]);
  });

  it('keeps the first error reason seen for a pillar when multiple adapters fail', () => {
    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'error', error: new Error('first') },
      { pillarId: 'media', adapterName: 'shows', reason: 'error', error: new Error('second') },
    ];

    const summary = summarisePartialFailures(
      [target('media', 'movies'), target('media', 'shows')],
      failures
    );

    expect(summary.failedPillars).toEqual([{ pillar: 'media', reason: 'first' }]);
  });

  it('falls back to a generic reason string when the error is not an Error instance', () => {
    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'error', error: 42 },
    ];

    const summary = summarisePartialFailures([target('media', 'movies')], failures);

    expect(summary.failedPillars).toEqual([{ pillar: 'media', reason: 'unknown error' }]);
  });

  it('passes through a string error payload as the failure reason', () => {
    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'error', error: 'network down' },
    ];

    const summary = summarisePartialFailures([target('media', 'movies')], failures);

    expect(summary.failedPillars).toEqual([{ pillar: 'media', reason: 'network down' }]);
  });

  it('falls back to the error name when the message is empty', () => {
    class WeirdError extends Error {
      override readonly name = 'WeirdError';
    }

    const failures: FederatedSearchFailure[] = [
      { pillarId: 'media', adapterName: 'movies', reason: 'error', error: new WeirdError('') },
    ];

    const summary = summarisePartialFailures([target('media', 'movies')], failures);

    expect(summary.failedPillars).toEqual([{ pillar: 'media', reason: 'WeirdError' }]);
  });
});

describe('runFederatedSearch — partial summary integration', () => {
  it('includes an empty partial block when every pillar responded', async () => {
    const invoker: SearchAdapterInvoker = (callTarget) =>
      Promise.resolve([result(1, `${callTarget.pillarId}-${callTarget.adapterName}`)]);

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.partial).toEqual({
      requestedPillars: ['finance', 'media'],
      respondedPillars: ['finance', 'media'],
      failedPillars: [],
      timeoutPillars: [],
    });
  });

  it('demotes a pillar from respondedPillars when its adapter throws', async () => {
    const invoker: SearchAdapterInvoker = (callTarget) => {
      if (callTarget.pillarId === 'media') throw new Error('boom');
      return Promise.resolve([result(1, 'tx-1')]);
    };

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.partial.respondedPillars).toEqual(['finance']);
    expect(response.partial.failedPillars).toEqual([{ pillar: 'media', reason: 'boom' }]);
    expect(response.partial.timeoutPillars).toEqual([]);
  });

  it('reports timeoutPillars when an adapter aborts via the per-adapter timeout', async () => {
    vi.useFakeTimers();
    try {
      const invoker: SearchAdapterInvoker = (callTarget, _query, signal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          if (callTarget.pillarId === 'finance') resolve([result(1, 'fast-tx')]);
        });

      const promise = runFederatedSearch({
        query: { text: 'pizza' },
        invoker,
        timeoutMs: 100,
        discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
      });

      await vi.advanceTimersByTimeAsync(101);
      const response = await promise;

      expect(response.partial.timeoutPillars).toEqual(['media']);
      expect(response.partial.respondedPillars).toEqual(['finance']);
      expect(response.partial.failedPillars).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits unregistered pillars from requestedPillars entirely', async () => {
    const invoker: SearchAdapterInvoker = () => Promise.resolve([]);

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'], false)],
    });

    expect(response.partial.requestedPillars).toEqual(['finance']);
    expect(response.partial.respondedPillars).toEqual(['finance']);
  });

  it('reports requested but no responded pillars when every adapter fails', async () => {
    const invoker: SearchAdapterInvoker = () => Promise.reject(new Error('total outage'));

    const response = await runFederatedSearch({
      query: { text: 'pizza' },
      invoker,
      discovery: [snapshot('finance', ['transactions']), snapshot('media', ['movies'])],
    });

    expect(response.results).toEqual([]);
    expect(response.partial.requestedPillars).toEqual(['finance', 'media']);
    expect(response.partial.respondedPillars).toEqual([]);
    expect(response.partial.failedPillars).toEqual([
      { pillar: 'finance', reason: 'total outage' },
      { pillar: 'media', reason: 'total outage' },
    ]);
  });
});
