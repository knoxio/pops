import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WishlistFormValues, WishlistItem } from './types';

const wishlistListMock = vi.hoisted(() => vi.fn());
const wishlistCreateMock = vi.hoisted(() => vi.fn());
const wishlistUpdateMock = vi.hoisted(() => vi.fn());
const wishlistDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  wishlistList: (...args: unknown[]) => wishlistListMock(...args),
  wishlistCreate: (...args: unknown[]) => wishlistCreateMock(...args),
  wishlistUpdate: (...args: unknown[]) => wishlistUpdateMock(...args),
  wishlistDelete: (...args: unknown[]) => wishlistDeleteMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useWishlistPage } from './useWishlistPage';

function makeValues(overrides: Partial<WishlistFormValues> = {}): WishlistFormValues {
  return {
    item: 'Test Item',
    targetAmount: 100,
    saved: 25,
    priority: 'Soon',
    url: '',
    notes: '',
    ...overrides,
  };
}

function makeItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 'wish-1',
    item: 'Existing Item',
    targetAmount: 200,
    saved: 50,
    remainingAmount: 150,
    priority: 'Soon',
    url: null,
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  wishlistListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } },
    error: undefined,
  });
  wishlistCreateMock.mockResolvedValue({ data: { data: makeItem() }, error: undefined });
  wishlistUpdateMock.mockResolvedValue({ data: { data: makeItem() }, error: undefined });
  wishlistDeleteMock.mockResolvedValue({ data: { success: true }, error: undefined });
});

describe('useWishlistPage — list query', () => {
  it('issues a wishlist list query with limit 100', async () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useWishlistPage(), { wrapper });
    await waitFor(() => expect(wishlistListMock).toHaveBeenCalledWith({ query: { limit: 100 } }));
  });

  it('exposes the unwrapped list payload', async () => {
    const item = makeItem({ id: 'wish-99' });
    wishlistListMock.mockResolvedValue({
      data: { data: [item], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });
    await waitFor(() => expect(result.current.query.data?.data).toHaveLength(1));
    expect(result.current.query.data?.pagination.total).toBe(1);
  });
});

describe('useWishlistPage — onSubmit (create)', () => {
  it('coerces empty string url to null before sending', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.onSubmit(makeValues({ url: '' }));
    });

    await waitFor(() =>
      expect(wishlistCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ url: null }),
      })
    );
    expect(wishlistUpdateMock).not.toHaveBeenCalled();
  });

  it('coerces empty string notes to null before sending', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.onSubmit(makeValues({ notes: '' }));
    });

    await waitFor(() =>
      expect(wishlistCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ notes: null }),
      })
    );
  });

  it('passes a valid url through unchanged', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.onSubmit(makeValues({ url: 'https://example.com' }));
    });

    await waitFor(() =>
      expect(wishlistCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ url: 'https://example.com' }),
      })
    );
  });

  it('preserves all other field values when coercing', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.onSubmit(
        makeValues({
          item: 'New Camera',
          targetAmount: 1500,
          saved: 300,
          priority: 'One Day',
          url: '',
          notes: '',
        })
      );
    });

    await waitFor(() =>
      expect(wishlistCreateMock).toHaveBeenCalledWith({
        body: {
          item: 'New Camera',
          targetAmount: 1500,
          saved: 300,
          priority: 'One Day',
          url: null,
          notes: null,
        },
      })
    );
  });
});

describe('useWishlistPage — onSubmit (update)', () => {
  it('coerces empty url to null when updating an existing item', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeItem({ id: 'wish-42' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ url: '', notes: '' }));
    });

    await waitFor(() =>
      expect(wishlistUpdateMock).toHaveBeenCalledWith({
        path: { id: 'wish-42' },
        body: expect.objectContaining({ url: null, notes: null }),
      })
    );
    expect(wishlistCreateMock).not.toHaveBeenCalled();
  });

  it('passes a valid url through unchanged on update', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeItem({ id: 'wish-42' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ url: 'https://example.com/item' }));
    });

    await waitFor(() =>
      expect(wishlistUpdateMock).toHaveBeenCalledWith({
        path: { id: 'wish-42' },
        body: expect.objectContaining({ url: 'https://example.com/item' }),
      })
    );
  });
});

describe('useWishlistPage — delete', () => {
  it('invokes wishlistDelete with the row id and invalidates the list', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWishlistPage(), { wrapper });

    act(() => {
      result.current.deleteMutation.mutate({ id: 'wish-7' });
    });

    await waitFor(() =>
      expect(wishlistDeleteMock).toHaveBeenCalledWith({ path: { id: 'wish-7' } })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finance', 'wishlist'] })
    );
  });
});
