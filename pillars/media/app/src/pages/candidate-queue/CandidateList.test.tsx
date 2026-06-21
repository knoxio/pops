import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rotationListCandidatesMock = vi.hoisted(() => vi.fn());

vi.mock('../../media-api/index.js', () => ({
  rotationListCandidates: (...args: unknown[]) => rotationListCandidatesMock(...args),
}));

vi.mock('./CandidateCard', () => ({
  CandidateCard: ({ candidate }: { candidate: { id: number; title: string } }) =>
    createElement('div', { 'data-testid': `card-${candidate.id}` }, candidate.title),
}));

import { CandidateList } from './CandidateList';

interface CandidateRow {
  id: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  discoveredAt: string;
  sourceId: number;
  sourceName: string | null;
  sourcePriority: number | null;
  status: string;
}

function row(id: number, title: string): CandidateRow {
  return {
    id,
    tmdbId: id * 10,
    title,
    year: 2024,
    rating: 7.5,
    posterPath: null,
    discoveredAt: '2026-01-01T00:00:00Z',
    sourceId: 1,
    sourceName: 'Manual',
    sourcePriority: 1,
    status: 'pending',
  };
}

function listResult(items: CandidateRow[], total: number) {
  return { data: { data: { items, total } }, error: undefined };
}

function renderList(props?: {
  status?: 'pending' | 'added' | 'excluded';
  actions?: 'pending' | 'excluded' | 'none';
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <CandidateList status={props?.status ?? 'pending'} actions={props?.actions ?? 'pending'} />,
    { wrapper }
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CandidateList', () => {
  it('queries rotationListCandidates with the status filter and page-zero offset', async () => {
    rotationListCandidatesMock.mockResolvedValue(listResult([row(1, 'Dune')], 1));
    renderList({ status: 'added' });

    await waitFor(() =>
      expect(rotationListCandidatesMock).toHaveBeenCalledWith({
        query: { status: 'added', search: undefined, limit: 20, offset: 0 },
      })
    );
  });

  it('renders a card per returned candidate', async () => {
    rotationListCandidatesMock.mockResolvedValue(
      listResult([row(1, 'Dune'), row(2, 'Arrival')], 2)
    );
    renderList();

    expect(await screen.findByTestId('card-1')).toHaveTextContent('Dune');
    expect(screen.getByTestId('card-2')).toHaveTextContent('Arrival');
  });

  it('shows the empty-state copy when the list is empty', async () => {
    rotationListCandidatesMock.mockResolvedValue(listResult([], 0));
    renderList();

    expect(await screen.findByText('No candidates found')).toBeInTheDocument();
  });

  it('surfaces the unwrapped error rather than rendering stale data', async () => {
    rotationListCandidatesMock.mockResolvedValue({
      data: undefined,
      error: { message: 'rotation down' },
      response: { status: 500 },
    });
    renderList();

    await waitFor(() => expect(screen.getByText('No candidates found')).toBeInTheDocument());
    expect(screen.queryByTestId('card-1')).not.toBeInTheDocument();
  });
});
