// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { PillarCallError } from '../../client/errors.js';
import { __resetSharedPillarClient } from '../../client/factory.js';
import { usePillarMutation, usePillarQuery, usePillarUtils } from '../hooks.js';
import { PillarSdkProvider } from '../provider.js';
import { pillarQueryKey } from '../query-key.js';

import type { ReactNode } from 'react';

import type { PillarClientOptions } from '../../client/factory.js';

type FetchScript = (url: string, body: unknown) => Response | Promise<Response>;

type Harness = {
  wrapper: (props: { children: ReactNode }) => ReactNode;
  queryClient: QueryClient;
  calls: { url: string; body: unknown }[];
};

function buildHarness(transport: FakeRegistryTransport, script: FetchScript): Harness {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = fakeFetch(async (url, init) => {
    let parsed: unknown = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsed = JSON.parse(init.body);
      } catch {
        parsed = init.body;
      }
    }
    calls.push({ url, body: parsed });
    return script(url, parsed);
  });
  const options: PillarClientOptions = { transport, fetchImpl };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <PillarSdkProvider options={options}>{children}</PillarSdkProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient, calls };
}

type Item = { id: string; checked: boolean };

describe('usePillarUtils.setData', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('writes directly to the slot keyed by pillarQueryKey', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({ result: { data: [] } }));

    const { result } = renderHook(() => usePillarUtils('media'), { wrapper: harness.wrapper });

    act(() => {
      result.current.setData<readonly Item[]>(['watchlist', 'list'], { limit: 10 }, () => [
        { id: 'wl-1', checked: false },
      ]);
    });

    const key = pillarQueryKey('media', ['watchlist', 'list'], { limit: 10 });
    expect(harness.queryClient.getQueryData(key)).toEqual([{ id: 'wl-1', checked: false }]);
  });

  it('returns the previous value as the snapshot before applying the updater', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({ result: { data: [] } }));

    const { result } = renderHook(() => usePillarUtils('media'), { wrapper: harness.wrapper });

    const key = pillarQueryKey('media', ['watchlist', 'list'], { limit: 10 });
    harness.queryClient.setQueryData<readonly Item[]>(key, [{ id: 'wl-1', checked: false }]);

    let snapshot: readonly Item[] | undefined;
    act(() => {
      snapshot = result.current.setData<readonly Item[]>(
        ['watchlist', 'list'],
        { limit: 10 },
        (prev) => (prev ?? []).map((it) => ({ ...it, checked: true }))
      );
    });

    expect(snapshot).toEqual([{ id: 'wl-1', checked: false }]);
    expect(harness.queryClient.getQueryData(key)).toEqual([{ id: 'wl-1', checked: true }]);
  });
});

describe('usePillarUtils.invalidate', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('invalidates a specific router prefix', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('finance.wishlist.list')) {
        return jsonResponse({ result: { data: [{ id: 'a' }] } });
      }
      return jsonResponse({ result: { data: [] } });
    });

    const { result: queryResult } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    const before = harness.calls.filter((c) => c.url.endsWith('finance.wishlist.list')).length;

    const { result: utilsResult } = renderHook(() => usePillarUtils('finance'), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      await utilsResult.current.invalidate(['wishlist']);
    });

    await waitFor(() => {
      const after = harness.calls.filter((c) => c.url.endsWith('finance.wishlist.list')).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('invalidates the entire pillar when called with no routerPath', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('finance.wishlist.list')) {
        return jsonResponse({ result: { data: [{ id: 'a' }] } });
      }
      return jsonResponse({ result: { data: [] } });
    });

    const { result: queryResult } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    const before = harness.calls.filter((c) => c.url.endsWith('finance.wishlist.list')).length;

    const { result: utilsResult } = renderHook(() => usePillarUtils('finance'), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      await utilsResult.current.invalidate();
    });

    await waitFor(() => {
      const after = harness.calls.filter((c) => c.url.endsWith('finance.wishlist.list')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

describe('usePillarUtils.fetchQuery', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('resolves with the procedure output and caches it under the pillar query key', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const payload = [{ id: 'wl-1', checked: false }];
    const harness = buildHarness(transport, () => jsonResponse({ result: { data: payload } }));

    const { result } = renderHook(() => usePillarUtils('finance'), { wrapper: harness.wrapper });

    let value: readonly Item[] | undefined;
    await act(async () => {
      value = await result.current.fetchQuery<readonly Item[]>(['watchlist', 'list'], {
        limit: 10,
      });
    });

    expect(value).toEqual(payload);
    const key = pillarQueryKey('finance', ['watchlist', 'list'], { limit: 10 });
    expect(harness.queryClient.getQueryData(key)).toEqual(payload);
  });

  it('keys distinct inputs into separate cache slots', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    let next = 0;
    const harness = buildHarness(transport, () => {
      next += 1;
      return jsonResponse({ result: { data: [{ id: `wl-${next}`, checked: false }] } });
    });

    const { result } = renderHook(() => usePillarUtils('finance'), { wrapper: harness.wrapper });

    await act(async () => {
      await result.current.fetchQuery<readonly Item[]>(['watchlist', 'list'], { limit: 5 });
      await result.current.fetchQuery<readonly Item[]>(['watchlist', 'list'], { limit: 25 });
    });

    const keyA = pillarQueryKey('finance', ['watchlist', 'list'], { limit: 5 });
    const keyB = pillarQueryKey('finance', ['watchlist', 'list'], { limit: 25 });
    const a = harness.queryClient.getQueryData<readonly Item[]>(keyA);
    const b = harness.queryClient.getQueryData<readonly Item[]>(keyB);
    expect(a).toEqual([{ id: 'wl-1', checked: false }]);
    expect(b).toEqual([{ id: 'wl-2', checked: false }]);
  });

  it('serves the cached value without issuing a new network call when staleTime keeps it fresh', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ result: { data: [{ id: 'x' }] } })
    );

    const { result } = renderHook(() => usePillarUtils('finance'), { wrapper: harness.wrapper });

    await act(async () => {
      await result.current.fetchQuery<readonly { id: string }[]>(
        ['watchlist', 'list'],
        { limit: 10 },
        { staleTime: 60_000 }
      );
    });
    const callsAfterFirst = harness.calls.length;

    await act(async () => {
      await result.current.fetchQuery<readonly { id: string }[]>(
        ['watchlist', 'list'],
        { limit: 10 },
        { staleTime: 60_000 }
      );
    });

    expect(harness.calls.length).toBe(callsAfterFirst);
  });

  it('rejects with PillarCallError when the call fails', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(
      transport,
      () =>
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
    );

    const { result } = renderHook(() => usePillarUtils('finance'), { wrapper: harness.wrapper });

    let captured: unknown;
    await act(async () => {
      try {
        await result.current.fetchQuery<readonly Item[]>(['watchlist', 'list'], { limit: 10 });
      } catch (e) {
        captured = e;
      }
    });

    expect(captured).toBeInstanceOf(PillarCallError);
  });

  it('forwards retry: false via opts so failing calls reject immediately', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(
      transport,
      () =>
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
    );

    const { result } = renderHook(() => usePillarUtils('finance'), { wrapper: harness.wrapper });

    await act(async () => {
      try {
        await result.current.fetchQuery<readonly Item[]>(
          ['watchlist', 'list'],
          { limit: 10 },
          { retry: false }
        );
      } catch {
        // expected
      }
    });

    expect(harness.calls.length).toBe(1);
  });
});

describe('usePillarMutation optimistic updates', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('updates the cache during onMutate and rolls back from previousData on error', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('finance.wishlist.toggle')) {
        return new Response(
          JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
      return jsonResponse({ result: { data: [] } });
    });

    const key = pillarQueryKey('finance', ['wishlist', 'list'], { limit: 10 });
    const initial: readonly Item[] = [{ id: 'wl-1', checked: false }];
    harness.queryClient.setQueryData<readonly Item[]>(key, initial);

    type Ctx = { previous: readonly Item[] | undefined };
    const { result } = renderHook(
      () => {
        const utils = usePillarUtils('finance');
        const mutation = usePillarMutation<{ id: string }, { ok: true }, Ctx>(
          'finance',
          ['wishlist', 'toggle'],
          {
            onMutate: (vars) => {
              const previous = utils.setData<readonly Item[]>(
                ['wishlist', 'list'],
                { limit: 10 },
                (prev) =>
                  (prev ?? []).map((it) =>
                    it.id === vars.id ? { ...it, checked: !it.checked } : it
                  )
              );
              return { previous };
            },
            onError: (_err, _vars, ctx) => {
              if (ctx) {
                utils.setData<readonly Item[]>(
                  ['wishlist', 'list'],
                  { limit: 10 },
                  () => ctx.previous
                );
              }
            },
          }
        );
        return { utils, mutation };
      },
      { wrapper: harness.wrapper }
    );

    const optimisticPromise = act(async () => {
      try {
        await result.current.mutation.mutateAsync({ id: 'wl-1' });
      } catch {
        // expected — request fails so the rollback fires
      }
    });

    await waitFor(() => {
      const mid = harness.queryClient.getQueryData<readonly Item[]>(key);
      expect(mid).toEqual([{ id: 'wl-1', checked: true }]);
    });

    await optimisticPromise;

    await waitFor(() => expect(result.current.mutation.isError).toBe(true));
    expect(harness.queryClient.getQueryData(key)).toEqual(initial);
  });

  it('forwards onSettled on both success and failure paths', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    let mode: 'ok' | 'fail' = 'ok';
    const harness = buildHarness(transport, () => {
      if (mode === 'fail') {
        return new Response(
          JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
      return jsonResponse({ result: { data: { ok: true } } });
    });

    const settledCalls: Array<{ ok: boolean }> = [];
    const { result } = renderHook(
      () =>
        usePillarMutation<{ id: string }, { ok: true }>('finance', ['wishlist', 'toggle'], {
          onSettled: (data, error) => {
            settledCalls.push({ ok: data !== undefined && !error });
          },
        }),
      { wrapper: harness.wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 'a' });
    });

    mode = 'fail';
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'b' });
      } catch {
        // expected
      }
    });

    expect(settledCalls).toEqual([{ ok: true }, { ok: false }]);
  });
});
