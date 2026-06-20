import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

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

const mockComparisonsListAll = vi.fn();
const mockComparisonsListDimensions = vi.fn();
const mockComparisonsDelete = vi.fn();

vi.mock('../media-api/index.js', () => ({
  comparisonsListAll: (opts: unknown) => mockComparisonsListAll(opts),
  comparisonsListDimensions: () => mockComparisonsListDimensions(),
  comparisonsDelete: (opts: unknown) => mockComparisonsDelete(opts),
}));

vi.mock('./comparison-history/MovieTitle', () => ({
  MovieTitle: ({ mediaId, className }: { mediaId: number; className?: string }) => (
    <span className={className}>Movie {mediaId}</span>
  ),
}));

import { ComparisonHistoryPage } from './ComparisonHistoryPage';

const DIMENSION = { id: 1, name: 'Overall', active: true };
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
  mockComparisonsListDimensions.mockResolvedValue({ data: { data: [DIMENSION] } });
  mockComparisonsListAll.mockResolvedValue({
    data: { data: comparisons, pagination: { total, limit: 20, offset: 0, hasMore: false } },
  });
}

function setupEmpty() {
  mockComparisonsListDimensions.mockResolvedValue({ data: { data: [DIMENSION] } });
  mockComparisonsListAll.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } },
  });
}

function setupLoading() {
  mockComparisonsListDimensions.mockReturnValue(new Promise(() => {}));
  mockComparisonsListAll.mockReturnValue(new Promise(() => {}));
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, children));
  return render(<ComparisonHistoryPage />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockComparisonsDelete.mockResolvedValue({ data: { message: 'ok' } });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('ComparisonHistoryPage', () => {
  it('shows history list with comparison rows', async () => {
    setupLoaded();
    renderPage();
    await flush();

    expect(screen.getByText('Comparison History')).toBeInTheDocument();
    expect(screen.getByText('Movie 100')).toBeInTheDocument();
    expect(screen.getByText('beat')).toBeInTheDocument();
    expect(screen.getByText('Movie 200')).toBeInTheDocument();
    expect(screen.getAllByText('Overall').length).toBeGreaterThan(0);
  });

  it('shows tied display for draw comparisons (winnerId=0)', async () => {
    setupLoaded([DRAW_COMPARISON]);
    renderPage();
    await flush();

    expect(screen.getByText('tied')).toBeInTheDocument();
    expect(screen.queryByText('beat')).not.toBeInTheDocument();
    expect(screen.getByText('high draw')).toBeInTheDocument();
  });

  it('shows empty state when no comparisons', async () => {
    setupEmpty();
    renderPage();
    await flush();

    expect(screen.getByText(/No comparisons yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare Arena' })).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    setupLoading();
    const { container } = renderPage();

    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('optimistically hides row and shows undo toast on delete', async () => {
    setupLoaded();
    renderPage();
    await flush();

    expect(screen.getByText('Movie 100')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Movie 100')).not.toBeInTheDocument();
    expect(mockToastCustom).toHaveBeenCalled();
    expect(mockComparisonsDelete).not.toHaveBeenCalled();
  });

  it('executes delete after 5-second undo window', async () => {
    setupLoaded();
    renderPage();
    await flush();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    expect(mockComparisonsDelete).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockComparisonsDelete).toHaveBeenCalledWith({ path: { id: COMPARISON.id } });
  });

  it('cancels delete and restores row when undo is clicked', async () => {
    setupLoaded();
    renderPage();
    await flush();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Movie 100')).not.toBeInTheDocument();

    const renderFn = mockToastCustom.mock.calls[0]![0] as (
      id: string | number
    ) => React.ReactElement;
    const toastElement = renderFn('toast-custom-1');
    const { getByText: getToastByText } = render(toastElement);
    fireEvent.click(getToastByText('Undo'));

    expect(screen.getByText('Movie 100')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockComparisonsDelete).not.toHaveBeenCalled();
    expect(mockToastDismiss).toHaveBeenCalledWith('toast-custom-1');
  });

  it('invalidates queries on successful delete', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    setupLoaded();
    renderPage();
    await flush();

    const deleteBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(deleteBtn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flush();

    expect(mockComparisonsDelete).toHaveBeenCalledWith({ path: { id: COMPARISON.id } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['media', 'comparisons'] });
    invalidateSpy.mockRestore();
  });

  it('filters by dimension', async () => {
    setupLoaded();
    renderPage();
    await flush();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    await flush();

    expect(mockComparisonsListAll).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ dimensionId: 1 }),
    });
  });

  it('shows pagination when multiple pages exist', async () => {
    setupLoaded([COMPARISON], 50);
    renderPage();
    await flush();

    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it('renders search input', async () => {
    setupLoaded();
    renderPage();
    await flush();

    expect(screen.getByPlaceholderText('Search by movie title…')).toBeInTheDocument();
  });

  it('typing in search triggers filtered query after debounce', async () => {
    setupLoaded();
    renderPage();
    await flush();

    const searchInput = screen.getByPlaceholderText('Search by movie title…');
    fireEvent.change(searchInput, { target: { value: 'Dark' } });

    expect(mockComparisonsListAll).not.toHaveBeenLastCalledWith({
      query: expect.objectContaining({ search: 'Dark' }),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockComparisonsListAll).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ search: 'Dark' }),
    });
  });

  it('empty search does not pass search param to query', async () => {
    setupLoaded();
    renderPage();
    await flush();

    const searchInput = screen.getByPlaceholderText('Search by movie title…');
    fireEvent.change(searchInput, { target: { value: '   ' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mockComparisonsListAll).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ search: undefined }),
    });
  });
});
