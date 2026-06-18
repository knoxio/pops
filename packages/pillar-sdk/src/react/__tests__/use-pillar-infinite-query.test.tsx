// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  FakeRegistryTransport,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { usePillarInfiniteQuery } from '../hooks.js';
import { buildHarness, resetReactSdkCaches } from './rest-harness.js';

type Page = { items: readonly { id: string }[]; nextCursor: string | null };

describe('usePillarInfiniteQuery', () => {
  beforeEach(resetReactSdkCaches);
  afterEach(resetReactSdkCaches);

  it('fetches the first page and then a subsequent page via fetchNextPage', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const pages: Record<string, Page> = {
      'cursor-a': { items: [{ id: '1' }], nextCursor: 'cursor-b' },
      'cursor-b': { items: [{ id: '2' }], nextCursor: null },
    };
    const harness = buildHarness(transport, (_url, body) => {
      const cursor = (body as { cursor: string }).cursor;
      return jsonResponse(pages[cursor]);
    });

    const { result } = renderHook(
      () =>
        usePillarInfiniteQuery<Page, string>(
          'finance',
          ['wishlist', 'list'],
          { limit: 10 },
          {
            initialPageParam: 'cursor-a',
            getNextPageParam: (last) => last.nextCursor ?? undefined,
          }
        ),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe('1');
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]?.items[0]?.id).toBe('2');
    expect(result.current.hasNextPage).toBe(false);
  });

  it('stops paging once getNextPageParam returns undefined', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ items: [{ id: 'only' }], nextCursor: null })
    );

    const { result } = renderHook(
      () =>
        usePillarInfiniteQuery<Page, string | null>(
          'finance',
          ['wishlist', 'list'],
          {},
          {
            initialPageParam: null,
            getNextPageParam: (last) => last.nextCursor,
          }
        ),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data?.pages).toHaveLength(1);
  });

  it('surfaces failure flags when the pillar is unavailable', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const harness = buildHarness(transport, () => jsonResponse({}));

    const { result } = renderHook(
      () =>
        usePillarInfiniteQuery<Page, string | null>(
          'finance',
          ['wishlist', 'list'],
          {},
          {
            initialPageParam: null,
            getNextPageParam: () => undefined,
          }
        ),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.isDegraded).toBe(false);
  });

  it('refetch reissues the first-page request', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ items: [{ id: 'x' }], nextCursor: null })
    );

    const { result } = renderHook(
      () =>
        usePillarInfiniteQuery<Page, string | null>(
          'finance',
          ['wishlist', 'list'],
          {},
          {
            initialPageParam: null,
            getNextPageParam: () => undefined,
          }
        ),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const callsBefore = harness.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(harness.calls.length).toBeGreaterThan(callsBefore));
  });

  it('honours a custom buildInput when paging', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const harness = buildHarness(transport, () =>
      jsonResponse({ items: [{ id: 'y' }], nextCursor: 'next' })
    );

    const { result } = renderHook(
      () =>
        usePillarInfiniteQuery<Page, number>(
          'finance',
          ['wishlist', 'list'],
          { limit: 5 },
          {
            initialPageParam: 0,
            getNextPageParam: (_last, _pages, lastParam) =>
              lastParam < 1 ? lastParam + 1 : undefined,
            buildInput: (inp, page) => ({
              ...(inp as Record<string, unknown>),
              offset: page,
            }),
          }
        ),
      { wrapper: harness.wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.body).toEqual({
      limit: 5,
      offset: 0,
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(harness.calls.length).toBe(2));
    expect(harness.calls[1]?.body).toEqual({
      limit: 5,
      offset: 1,
    });
  });
});
