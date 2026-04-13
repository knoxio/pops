import { act, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComparisonHistoryPage } from './ComparisonHistoryPage';

// Mock sonner
const mockToast = vi.fn().mockReturnValue('toast-id-1');
const mockToastCustom = vi.fn().mockReturnValue('toast-custom-1');
const mockToastDismiss = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => mockToast(...args), {
    custom: (...args: unknown[]) => mockToastCustom(...args),
    dismiss: (...args: unknown[]) => mockToastDismiss(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}));

// Mock trpc
const mockListAllQuery = vi.fn();
const mockDimensionsQuery = vi.fn();
const mockMovieGetQuery = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidateListAll = vi.fn();
const mockInvalidateScores = vi.fn();
const mockInvalidateRankings = vi.fn();
const mockRefetch = vi.fn();
let deleteMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        listAll: {
          useQuery: (...args: unknown[]) => mockListAllQuery(...args),
        },
        listDimensions: {
          useQuery: (...args: unknown[]) => mockDimensionsQuery(...args),
        },
        delete: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            deleteMutationOpts = opts;
            return { mutate: mockDeleteMutate, isPending: false };
          },
        },
      },
      movies: {
        get: {
          useQuery: (...args: unknown[]) => mockMovieGetQuery(...args),
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          listAll: { invalidate: mockInvalidateListAll },
          scores: { invalidate: mockInvalidateScores },
          rankings: { invalidate: mockInvalidateRankings },
        },
      },
    }),
  },
}));

const DIMENSION = { id: 1, name: 'Overall' };
const COMPARISON = {
  id: 10,
  dimensionId: 1,
  mediaAType: 'movie',
  mediaAId: 100,
  mediaBType: 'movie',
  mediaBId: 200,
  winnerType: 'movie',
  winnerId: 100,
  deltaA: 12,
  deltaB: -12,
  drawTier: null as string | null,
  comparedAt: '2026-01-15T12:00:00Z',
};
const DRAW_COMPARISON = {
  id: 11,
  dimensionId: 1,
  mediaAType: 'movie',
  mediaAId: 100,
  mediaBType: 'movie',
  mediaBId: 200,
  winnerType: 'movie',
  winnerId: 0,
  deltaA: 0,
  deltaB: 0,
  drawTier: 'high',
  comparedAt: '2026-01-15T12:00:00Z',
};

function setupLoaded(comparisons = [COMPARISON], total = comparisons.length) {
  mockDimensionsQuery.mockReturnValue({ data: { data: [DIMENSION] } });
  mockListAllQuery.mockReturnValue({
    data: { data: comparisons, pagination: { total, limit: 20, offset: 0 } },
    isLoading: false,
    refetch: mockRefetch,
  });
  mockMovieGetQuery.mockImplementation(({ id }: { id: number }) => ({
    data: { data: { title: `Movie ${id}` } },
  }));
}

function setupEmpty() {
  mockDimensionsQuery.mockReturnValue({ data: { data: [DIMENSION] } });
  mockListAllQuery.mockReturnValue({
    data: { data: [], pagination: { total: 0, limit: 20, offset: 0 } },
    isLoading: false,
    refetch: mockRefetch,
  });
}

function setupLoading() {
  mockDimensionsQuery.mockReturnValue({ data: undefined });
  mockListAllQuery.mockReturnValue({ data: undefined, isLoading: true, refetch: mockRefetch });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ComparisonHistoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ComparisonHistoryPage', () => {
  it('shows history list with comparison rows', () => {
    setupLoaded();
    renderPage();

    expect(screen.getByText('Comparison History')).toBeInTheDocument();
    expect(screen.getByText('Movie 100')).toBeInTheDocument();
    expect(screen.getByText('beat')).toBeInTheDocument();
    expect(screen.getByText('Movie 200')).toBeInTheDocument();
    expect(screen.getAllByText('Overall').length).toBeGreaterThan(0);
  });

  it('shows tied display for draw comparisons (winnerId=0)', () => {
    setupLoaded([DRAW_COMPARISON]);
    renderPage();

    expect(screen.getByText('tied')).toBeInTheDocument();
    expect(screen.queryByText('beat')).not.toBeInTheDocument();
    expect(screen.queryByText('Movie #0')).not.toBeInTheDocument();
    expect(screen.getByText('high draw')).toBeInTheDocument();
  });

  it('shows empty state when no comparisons', () => {
    setupEmpty();
    renderPage();

    expect(screen.getByText(/No comparisons yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare Arena' })).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    setupLoading();
    const { container } = renderPage();

    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('optimistically hides row and shows undo toast on delete', () => {
    setupLoaded();
    renderPage();

    expect(screen.getByText('Movie 100')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    // Row removed optimistically
    expect(screen.queryByText('Movie 100')).not.toBeInTheDocument();
    // Custom toast shown with undo
    expect(mockToastCustom).toHaveBeenCalled();
    // Mutation not fired yet
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('executes delete after 5-second undo window', () => {
    setupLoaded();
    renderPage();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: COMPARISON.id });
  });

  it('cancels delete and restores row when undo is clicked', () => {
    setupLoaded();
    renderPage();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    // Row gone
    expect(screen.queryByText('Movie 100')).not.toBeInTheDocument();

    // Extract the render function passed to toast.custom and render it to get the Undo button
    const renderFn = mockToastCustom.mock.calls[0]![0] as (
      id: string | number
    ) => React.ReactElement;
    const toastElement = renderFn('toast-custom-1');
    const { getByText: getToastByText } = render(toastElement);
    fireEvent.click(getToastByText('Undo'));

    // Row restored
    expect(screen.getByText('Movie 100')).toBeInTheDocument();
    // Timer should not fire delete
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(mockToastDismiss).toHaveBeenCalledWith('toast-custom-1');
  });

  it('invalidates queries on successful delete', () => {
    setupLoaded();
    renderPage();

    // Trigger the onSuccess callback directly
    act(() => {
      deleteMutationOpts.onSuccess?.(undefined, { id: COMPARISON.id });
    });

    expect(mockInvalidateListAll).toHaveBeenCalled();
    expect(mockInvalidateScores).toHaveBeenCalled();
    expect(mockInvalidateRankings).toHaveBeenCalled();
  });

  it('filters by dimension', () => {
    setupLoaded();
    renderPage();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });

    expect(mockListAllQuery).toHaveBeenLastCalledWith(expect.objectContaining({ dimensionId: 1 }));
  });

  it('shows pagination when multiple pages exist', () => {
    setupLoaded([COMPARISON], 50);
    renderPage();

    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it('renders search input', () => {
    setupLoaded();
    renderPage();

    expect(screen.getByPlaceholderText('Search by movie title…')).toBeInTheDocument();
  });

  it('typing in search triggers filtered query after debounce', () => {
    setupLoaded();
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search by movie title…');
    fireEvent.change(searchInput, { target: { value: 'Dark' } });

    // Before debounce fires: no search param
    expect(mockListAllQuery).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Dark' })
    );

    // Fire debounce timer and flush React state updates
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mockListAllQuery).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Dark' }));
  });

  it('empty search does not pass search param to query', () => {
    setupLoaded();
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search by movie title…');
    fireEvent.change(searchInput, { target: { value: '   ' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockListAllQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined })
    );
  });
});
