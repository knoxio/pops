import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetInvokeToolInternals,
  __setInvokeToolInternals,
  DEFAULT_TOOL_TIMEOUT_MS,
  invokeTool,
} from '../tool-router.js';

import type { CallResult } from '../../client/index.js';

type ProcedureFn = (input: unknown) => Promise<CallResult<unknown>>;

type FakePillarOptions = {
  procedures?: Record<string, ProcedureFn>;
  subRouter?: string;
};

function fakePillar(options: FakePillarOptions = {}) {
  const calls: Array<{ pillarId: string; path: string[]; input: unknown }> = [];
  const subRouter = options.subRouter ?? 'aiTools';
  const procedures = options.procedures ?? {};
  const factory = (pillarId: string): unknown => {
    return new Proxy(
      {},
      {
        get(_t, branch) {
          if (branch !== subRouter) return undefined;
          return new Proxy(
            {},
            {
              get(_t2, procedure) {
                if (typeof procedure !== 'string') return undefined;
                const impl = procedures[procedure];
                if (!impl) return undefined;
                return (input: unknown) => {
                  calls.push({ pillarId, path: [subRouter, procedure], input });
                  return impl(input);
                };
              },
            }
          );
        },
      }
    );
  };
  return { factory, calls };
}

beforeEach(() => {
  __resetInvokeToolInternals();
});

afterEach(() => {
  __resetInvokeToolInternals();
  vi.useRealTimers();
});

describe('invokeTool — name parsing', () => {
  it("returns 'unknown-tool' when the name has no dot", async () => {
    const result = await invokeTool('search', {});
    expect(result).toEqual({ kind: 'unknown-tool', toolName: 'search' });
  });

  it("returns 'unknown-tool' when the pillar segment is empty", async () => {
    const result = await invokeTool('.search', {});
    expect(result.kind).toBe('unknown-tool');
  });

  it("returns 'unknown-tool' when the tool segment is empty", async () => {
    const result = await invokeTool('finance.', {});
    expect(result.kind).toBe('unknown-tool');
  });

  it("returns 'unknown-tool' when the tool name contains a sub-path dot", async () => {
    const result = await invokeTool('finance.transactions.search', {});
    expect(result).toEqual({ kind: 'unknown-tool', toolName: 'finance.transactions.search' });
  });

  it("returns 'unknown-tool' on the empty string", async () => {
    const result = await invokeTool('', {});
    expect(result.kind).toBe('unknown-tool');
  });
});

describe('invokeTool — happy path', () => {
  it("routes <pillar>.<tool> to pillar(<pillar>).aiTools.<tool>(parameters) and unwraps 'ok'", async () => {
    const { factory, calls } = fakePillar({
      procedures: {
        searchTransactions: async () => ({
          kind: 'ok',
          value: [{ id: 'tx-1' }],
        }),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.searchTransactions', { limit: 10 });

    expect(result).toEqual({ kind: 'ok', output: [{ id: 'tx-1' }] });
    expect(calls).toEqual([
      { pillarId: 'finance', path: ['aiTools', 'searchTransactions'], input: { limit: 10 } },
    ]);
  });

  it('forwards the parameters object verbatim to the procedure', async () => {
    let received: unknown;
    const { factory } = fakePillar({
      procedures: {
        doThing: async (input) => {
          received = input;
          return { kind: 'ok', value: null };
        },
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    await invokeTool('cerebrum.doThing', { foo: 'bar', n: 42 });
    expect(received).toEqual({ foo: 'bar', n: 42 });
  });
});

describe('invokeTool — error mapping', () => {
  it("maps 'unavailable' to 'pillar-unavailable' with the pillar id", async () => {
    const { factory } = fakePillar({
      procedures: {
        doThing: async () => ({ kind: 'unavailable', pillar: 'finance' }),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.doThing', {});
    expect(result).toEqual({ kind: 'pillar-unavailable', pillar: 'finance' });
  });

  it("maps 'degraded' (reconciling) to 'pillar-unavailable'", async () => {
    const { factory } = fakePillar({
      procedures: {
        doThing: async () => ({ kind: 'degraded', pillar: 'finance', reason: 'reconciling' }),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.doThing', {});
    expect(result).toEqual({ kind: 'pillar-unavailable', pillar: 'finance' });
  });

  it("maps 'contract-mismatch' to 'tool-error'", async () => {
    const { factory } = fakePillar({
      procedures: {
        doThing: async () => ({
          kind: 'contract-mismatch',
          pillar: 'finance',
          expected: '1.0.0',
          actual: '2.0.0',
        }),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.doThing', {});
    expect(result).toEqual({ kind: 'tool-error', reason: 'contract mismatch' });
  });

  it("returns 'tool-error' when the procedure throws an Error", async () => {
    const { factory } = fakePillar({
      procedures: {
        doThing: async () => {
          throw new Error('boom');
        },
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.doThing', {});
    expect(result).toEqual({ kind: 'tool-error', reason: 'boom' });
  });

  it("returns 'tool-error' (reason 'tool not exposed by pillar') when the aiTools path is missing", async () => {
    const { factory } = fakePillar({ procedures: {} });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.missingTool', {});
    expect(result).toEqual({ kind: 'tool-error', reason: 'tool not exposed by pillar' });
  });

  it("returns 'tool-error' when the pillar does not expose an aiTools sub-router", async () => {
    const { factory } = fakePillar({
      subRouter: 'somethingElse',
      procedures: { doThing: async () => ({ kind: 'ok', value: null }) },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const result = await invokeTool('finance.doThing', {});
    expect(result.kind).toBe('tool-error');
  });
});

describe('invokeTool — timeout', () => {
  it("returns 'tool-error' with reason 'timeout' when the procedure exceeds the deadline", async () => {
    vi.useFakeTimers();
    const { factory } = fakePillar({
      procedures: {
        slow: () => new Promise<CallResult<unknown>>(() => undefined),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const pending = invokeTool('finance.slow', {}, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;
    expect(result).toEqual({ kind: 'tool-error', reason: 'timeout' });
  });

  it('defaults to a 30s deadline', () => {
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(30_000);
  });

  it('does not time out when the procedure resolves before the deadline', async () => {
    vi.useFakeTimers();
    const { factory } = fakePillar({
      procedures: {
        fast: async () => ({ kind: 'ok', value: 'done' }),
      },
    });
    __setInvokeToolInternals({ pillarFactory: factory });

    const pending = invokeTool('finance.fast', {}, { timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;
    expect(result).toEqual({ kind: 'ok', output: 'done' });
  });
});
