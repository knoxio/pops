// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  FINANCE_OPENAPI,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { usePillarCallDynamic, usePillarCallDynamicMutation } from '../hooks.js';
import { PillarSdkProvider } from '../provider.js';
import { buildHarness, resetReactSdkCaches } from './rest-harness.js';

import type { ReactNode } from 'react';

describe('usePillarCallDynamic — query path', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('runs a runtime-path query and returns the data', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse([{ id: 'wish-1' }]));
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

  it('surfaces a 404 resource-not-found via isNotFound', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const domainCalls: { url: string }[] = [];
    const fetchImpl = fakeFetch(async (url) => {
      if (url.endsWith('/openapi')) return jsonResponse(FINANCE_OPENAPI);
      domainCalls.push({ url });
      return jsonResponse({ message: 'no such wish' }, { status: 404 });
    });
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={harness.queryClient}>
        <PillarSdkProvider options={{ transport, fetchImpl }}>{children}</PillarSdkProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        usePillarCallDynamic({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'get',
          input: { id: 'missing' },
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotFound).toBe(true);
    expect(result.current.isContractMismatch).toBe(false);
    expect(domainCalls[0]?.url).toBe('http://finance-api:3004/wishlist/get');
  });

  it('surfaces an unknown procedure (absent from the contract) via isContractMismatch', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(
      () =>
        usePillarCallDynamic({
          pillarId: 'finance',
          routerName: 'wishlist',
          procName: 'nope',
          input: {},
        }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isContractMismatch).toBe(true);
    expect(result.current.isNotFound).toBe(false);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('usePillarCallDynamicMutation', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('returns a mutation handle that POSTs the input to the dynamic path', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({ id: 'created' }));
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
    expect(harness.calls[0]?.url).toBe('http://finance-api:3004/wishlist/create');
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
