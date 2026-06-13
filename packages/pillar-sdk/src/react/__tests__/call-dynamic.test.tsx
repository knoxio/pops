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
import { __resetSharedPillarClient } from '../../client/factory.js';
import { usePillarCallDynamic, usePillarCallDynamicMutation } from '../hooks.js';
import { PillarSdkProvider } from '../provider.js';

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

describe('usePillarCallDynamic — query path', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('runs a runtime-path query and returns the data', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ result: { data: [{ id: 'wish-1' }] } })
    );
    const { result } = renderHook(
      () =>
        usePillarCallDynamic({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'list',
          input: { limit: 10 },
        }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'wish-1' }]);
    expect(result.current.isUnavailable).toBe(false);
    expect(result.current.isContractMismatch).toBe(false);
    expect(result.current.isDegraded).toBe(false);
  });

  it('surfaces `unavailable` via isUnavailable flag', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(
      () =>
        usePillarCallDynamic({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'list',
          input: {},
        }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
  });

  it('surfaces a 404 path-not-found via isNotFound', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = fakeFetch(async (url) => {
      calls.push({ url, body: null });
      return new Response('not found', { status: 404 });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={queryClient}>
        <PillarSdkProvider options={{ transport, fetchImpl }}>{children}</PillarSdkProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        usePillarCallDynamic({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'nope',
          input: {},
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotFound).toBe(true);
    expect(result.current.isContractMismatch).toBe(false);
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.nope');
  });
});

describe('usePillarCallDynamicMutation', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('returns a mutation handle that POSTs the input to the dynamic path', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ result: { data: { id: 'created' } } })
    );
    const { result } = renderHook(
      () =>
        usePillarCallDynamicMutation({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'create',
        }),
      { wrapper: harness.wrapper }
    );
    await act(async () => {
      await result.current.mutateAsync({ name: 'new wish' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'created' });
    expect(harness.calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.create');
    expect(harness.calls[0]?.body).toEqual({ name: 'new wish' });
  });

  it('surfaces unavailable via isUnavailable on error', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(
      () =>
        usePillarCallDynamicMutation({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'create',
        }),
      { wrapper: harness.wrapper }
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({});
      } catch {
        // PillarCallError expected
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
  });
});
