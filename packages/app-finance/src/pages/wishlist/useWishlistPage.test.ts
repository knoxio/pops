import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WishlistFormValues, WishlistItem } from './types';

// ---------- mocks ----------

const mockListQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    finance: {
      wishlist: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        create: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockCreateMutate(...args),
            isPending: false,
          }),
        },
        update: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockUpdateMutate(...args),
            isPending: false,
          }),
        },
        delete: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockDeleteMutate(...args),
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({
      finance: {
        wishlist: {
          list: { invalidate: mockInvalidate },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are registered.
import { useWishlistPage } from './useWishlistPage';

// ---------- helpers ----------

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

beforeEach(() => {
  vi.clearAllMocks();
  mockListQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
});

// ---------- create path ----------

describe('useWishlistPage — onSubmit (create)', () => {
  it('coerces empty string url to null before sending', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.onSubmit(makeValues({ url: '' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ url: null }));
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('coerces empty string notes to null before sending', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.onSubmit(makeValues({ notes: '' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
  });

  it('passes a valid url through unchanged', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.onSubmit(makeValues({ url: 'https://example.com' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com' })
    );
  });

  it('passes non-empty notes through unchanged', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.onSubmit(makeValues({ notes: 'Some notes' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Some notes' }));
  });

  it('preserves all other field values when coercing', () => {
    const { result } = renderHook(() => useWishlistPage());

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

    expect(mockCreateMutate).toHaveBeenCalledWith({
      item: 'New Camera',
      targetAmount: 1500,
      saved: 300,
      priority: 'One Day',
      url: null,
      notes: null,
    });
  });

  it('coerces null/undefined url to null (defensive)', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.onSubmit(makeValues({ url: null }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ url: null }));
  });
});

// ---------- update path ----------

describe('useWishlistPage — onSubmit (update)', () => {
  it('coerces empty url to null when updating an existing item', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.handleEdit(makeItem({ id: 'wish-42' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ url: '', notes: '' }));
    });

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'wish-42',
      data: expect.objectContaining({ url: null, notes: null }),
    });
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('passes a valid url through unchanged on update', () => {
    const { result } = renderHook(() => useWishlistPage());

    act(() => {
      result.current.handleEdit(makeItem({ id: 'wish-42' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ url: 'https://example.com/item' }));
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'wish-42',
      data: expect.objectContaining({ url: 'https://example.com/item' }),
    });
  });
});
