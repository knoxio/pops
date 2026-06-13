// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { __resetSharedPillarClient } from '../../client/factory.js';
import { pillarQueryArg, usePillarQueries, type PillarQueryArg } from '../hooks.js';
import { PillarSdkProvider } from '../provider.js';

import type { ReactNode } from 'react';

import type { PillarClientOptions } from '../../client/factory.js';

type Ingredient = { id: string; name: string };
type Unit = { id: string; symbol: string };

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

describe('usePillarQueries', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('runs each descriptor in parallel and returns results in matching order', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (_url, body) => {
      const input = body as { id: string };
      if (input.id === 'a') return jsonResponse({ result: { data: { id: 'a', name: 'apple' } } });
      return jsonResponse({ result: { data: { id: 'b', name: 'banana' } } });
    });

    const { result } = renderHook(
      () =>
        usePillarQueries([
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['wishlist', 'get'],
            input: { id: 'a' },
          }),
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['wishlist', 'get'],
            input: { id: 'b' },
          }),
        ]),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].data).toEqual({ id: 'a', name: 'apple' });
    expect(result.current[1].data).toEqual({ id: 'b', name: 'banana' });
    expect(harness.calls).toHaveLength(2);
  });

  it('preserves per-element output types via the pillarQueryArg builder', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (_url, body) => {
      const input = body as { id: string };
      if (input.id === 'ing-1') {
        return jsonResponse({ result: { data: { id: 'ing-1', name: 'flour' } } });
      }
      return jsonResponse({ result: { data: { id: 'unit-1', symbol: 'g' } } });
    });

    const { result } = renderHook(
      () => {
        const queries = usePillarQueries([
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['ingredients', 'get'],
            input: { id: 'ing-1' },
          }),
          pillarQueryArg<Unit>({
            pillarId: 'finance',
            path: ['units', 'get'],
            input: { id: 'unit-1' },
          }),
        ]);
        return queries;
      },
      { wrapper: harness.wrapper }
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    const ing: Ingredient | undefined = result.current[0].data;
    const unit: Unit | undefined = result.current[1].data;
    expect(ing?.name).toBe('flour');
    expect(unit?.symbol).toBe('g');
  });

  it('handles an empty queries array without issuing any calls', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({}));

    const { result } = renderHook(() => usePillarQueries([]), { wrapper: harness.wrapper });

    expect(result.current).toEqual([]);
    expect(harness.calls).toHaveLength(0);
  });

  it('surfaces failure flags per element when one pillar is unavailable', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (_url, body) => {
      return jsonResponse({ result: { data: { id: (body as { id: string }).id, name: 'ok' } } });
    });

    const { result } = renderHook(
      () =>
        usePillarQueries([
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['wishlist', 'get'],
            input: { id: 'a' },
          }),
          pillarQueryArg<Ingredient>({
            pillarId: 'missing-pillar',
            path: ['wishlist', 'get'],
            input: { id: 'b' },
          }),
        ]),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isError).toBe(true);
    });

    expect(result.current[0].isUnavailable).toBe(false);
    expect(result.current[1].isUnavailable).toBe(true);
  });

  it('forwards per-query options (enabled: false skips the call)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ result: { data: { id: 'a', name: 'apple' } } })
    );

    const { result } = renderHook(
      () =>
        usePillarQueries([
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['wishlist', 'get'],
            input: { id: 'a' },
          }),
          pillarQueryArg<Ingredient>({
            pillarId: 'finance',
            path: ['wishlist', 'get'],
            input: { id: 'b' },
            options: { enabled: false },
          }),
        ]),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
    expect(result.current[1].fetchStatus).toBe('idle');
    expect(result.current[1].isPending).toBe(true);
    expect(harness.calls).toHaveLength(1);
  });

  it('is covariant on TOutput so .map()-produced arrays satisfy the readonly PillarQueryArg<unknown>[] constraint', () => {
    type IngredientsGetOutput = { id: string; variants: readonly { id: number; name: string }[] };

    const ids: readonly number[] = [1, 2, 3];
    const args = ids.map((id) =>
      pillarQueryArg<IngredientsGetOutput>({
        pillarId: 'food',
        path: ['ingredients', 'get'],
        input: { idOrSlug: id },
      })
    ) satisfies readonly PillarQueryArg<unknown>[];

    const single: PillarQueryArg<IngredientsGetOutput> = pillarQueryArg<IngredientsGetOutput>({
      pillarId: 'food',
      path: ['ingredients', 'get'],
      input: { idOrSlug: 1 },
    });
    const widened: PillarQueryArg<unknown> = single;

    expect(args).toHaveLength(3);
    expect(widened.pillarId).toBe('food');
  });
});
