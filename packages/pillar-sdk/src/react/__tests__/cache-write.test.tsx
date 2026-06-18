// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  FakeRegistryTransport,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { PillarCallError } from '../../client/errors.js';
import { usePillarMutation, usePillarQuery, usePillarUtils } from '../hooks.js';
import { pillarQueryKey } from '../query-key.js';
import { buildHarness, resetReactSdkCaches } from './rest-harness.js';

type Item = { id: string; checked: boolean };

describe('usePillarUtils.setData', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('writes directly to the slot keyed by pillarQueryKey', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse([]));

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
    const harness = buildHarness(transport, () => jsonResponse([]));

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
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('invalidates a specific router prefix', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('/wishlist/list')) {
        return jsonResponse([{ id: 'a' }]);
      }
      return jsonResponse([]);
    });

    const { result: queryResult } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    const before = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;

    const { result: utilsResult } = renderHook(() => usePillarUtils('finance'), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      await utilsResult.current.invalidate(['wishlist']);
    });

    await waitFor(() => {
      const after = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('invalidates the entire pillar when called with no routerPath', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('/wishlist/list')) {
        return jsonResponse([{ id: 'a' }]);
      }
      return jsonResponse([]);
    });

    const { result: queryResult } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    const before = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;

    const { result: utilsResult } = renderHook(() => usePillarUtils('finance'), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      await utilsResult.current.invalidate();
    });

    await waitFor(() => {
      const after = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

describe('usePillarUtils.fetchQuery', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('resolves with the procedure output and caches it under the pillar query key', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const payload = [{ id: 'wl-1', checked: false }];
    const harness = buildHarness(transport, () => jsonResponse(payload));

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
      return jsonResponse([{ id: `wl-${next}`, checked: false }]);
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
    const harness = buildHarness(transport, () => jsonResponse([{ id: 'x' }]));

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
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('updates the cache during onMutate and rolls back from previousData on error', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('/wishlist/toggle')) {
        return jsonResponse({ message: 'boom' }, { status: 500 });
      }
      return jsonResponse([]);
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
        return jsonResponse({ message: 'boom' }, { status: 500 });
      }
      return jsonResponse({ ok: true });
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
