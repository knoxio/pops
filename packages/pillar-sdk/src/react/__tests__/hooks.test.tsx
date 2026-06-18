// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { usePillarMutation, usePillarQuery } from '../hooks.js';
import { PillarSdkProvider } from '../provider.js';
import { buildHarness, resetReactSdkCaches } from './rest-harness.js';

import type { ReactNode } from 'react';

describe('usePillarQuery', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('returns data from a successful pillar call (happy path)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse([{ id: 'wish-1' }]));
    const { result } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'wish-1' }]);
    expect(result.current.isContractMismatch).toBe(false);
    expect(result.current.isUnavailable).toBe(false);
    expect(result.current.isDegraded).toBe(false);
  });

  it('maps `unavailable` failures onto isUnavailable', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(() => usePillarQuery('finance', ['wishlist', 'list'], {}), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.isContractMismatch).toBe(false);
    expect(result.current.isDegraded).toBe(false);
  });

  it('maps `contract-mismatch` failures onto isContractMismatch', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [
        discoveredPillar({
          manifest: {
            ...discoveredPillar().manifest,
            contract: {
              package: '@pops/finance-contract',
              version: '2.0.0',
              tag: 'contract-finance@v2.0.0',
            },
          },
        }),
      ],
    });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={harness.queryClient}>
        <PillarSdkProvider
          options={{
            transport,
            fetchImpl: fakeFetch(() => jsonResponse({})),
            contractVersion: '1.4.2',
          }}
        >
          {children}
        </PillarSdkProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => usePillarQuery('finance', ['wishlist', 'list'], {}), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isContractMismatch).toBe(true);
    expect(result.current.isUnavailable).toBe(false);
  });

  it('maps `degraded` failures onto isDegraded', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ status: 'unknown' })],
    });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(() => usePillarQuery('finance', ['wishlist', 'list'], {}), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.isUnavailable).toBe(false);
  });
});

describe('usePillarMutation', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('runs the mutation and reports isPending + final data', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () => jsonResponse({ id: 'created' }));
    const { result } = renderHook(
      () => usePillarMutation<{ name: string }, { id: string }>('finance', ['wishlist', 'create']),
      { wrapper: harness.wrapper }
    );
    expect(result.current.isPending).toBe(false);
    await act(async () => {
      await result.current.mutateAsync({ name: 'new wish' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'created' });
    expect(result.current.error).toBeNull();
  });

  it('invalidates the matching query prefix on success', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, (url) => {
      if (url.endsWith('/wishlist/list')) {
        return jsonResponse([{ id: 'a' }]);
      }
      return jsonResponse({ id: 'created' });
    });

    const { result: queryResult } = renderHook(
      () =>
        usePillarQuery<readonly { id: string }[]>('finance', ['wishlist', 'list'], { limit: 10 }),
      { wrapper: harness.wrapper }
    );
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));

    const listCallsBefore = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;
    expect(listCallsBefore).toBe(1);

    const { result: mutationResult } = renderHook(
      () => usePillarMutation<{ name: string }, { id: string }>('finance', ['wishlist', 'create']),
      { wrapper: harness.wrapper }
    );
    await act(async () => {
      await mutationResult.current.mutateAsync({ name: 'new' });
    });

    await waitFor(() => {
      const listCallsAfter = harness.calls.filter((c) => c.url.endsWith('/wishlist/list')).length;
      expect(listCallsAfter).toBeGreaterThan(listCallsBefore);
    });
  });

  it('maps mutation failures onto failure flags', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const harness = buildHarness(transport, () => jsonResponse({}));
    const { result } = renderHook(() => usePillarMutation('finance', ['wishlist', 'create']), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      try {
        await result.current.mutateAsync({});
      } catch {
        // expected — mutation throws PillarCallError
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
  });
});
