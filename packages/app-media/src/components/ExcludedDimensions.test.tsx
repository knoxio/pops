import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const comparisonsScoresMock = vi.hoisted(() => vi.fn());
const comparisonsListDimensionsMock = vi.hoisted(() => vi.fn());
const comparisonsIncludeInDimensionMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  comparisonsScores: (...args: unknown[]) => comparisonsScoresMock(...args),
  comparisonsListDimensions: (...args: unknown[]) => comparisonsListDimensionsMock(...args),
  comparisonsIncludeInDimension: (...args: unknown[]) => comparisonsIncludeInDimensionMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ExcludedDimensions } from './ExcludedDimensions';

const baseDimensions = [
  { id: 1, name: 'Cinematography' },
  { id: 2, name: 'Entertainment' },
  { id: 3, name: 'Emotional Impact' },
];

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderExcluded(props: { mediaType: 'movie' | 'tv_show'; mediaId: number }) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<ExcludedDimensions {...props} />, { wrapper });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  comparisonsListDimensionsMock.mockResolvedValue(ok({ data: baseDimensions }));
  comparisonsIncludeInDimensionMock.mockResolvedValue(ok({ message: 'ok' }));
});

describe('ExcludedDimensions', () => {
  it('renders nothing when no dimensions are excluded', async () => {
    comparisonsScoresMock.mockResolvedValue(
      ok({
        data: [
          { dimensionId: 1, score: 1500, comparisonCount: 5, excluded: false },
          { dimensionId: 2, score: 1300, comparisonCount: 4, excluded: false },
        ],
      })
    );

    const { container } = renderExcluded({ mediaType: 'movie', mediaId: 42 });
    await waitFor(() => expect(comparisonsScoresMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('shows excluded dimensions with Include buttons', async () => {
    comparisonsScoresMock.mockResolvedValue(
      ok({
        data: [
          { dimensionId: 1, score: 1500, comparisonCount: 5, excluded: true },
          { dimensionId: 2, score: 1300, comparisonCount: 4, excluded: false },
          { dimensionId: 3, score: 1200, comparisonCount: 2, excluded: true },
        ],
      })
    );

    renderExcluded({ mediaType: 'movie', mediaId: 42 });

    expect(await screen.findByText('Excluded Dimensions')).toBeInTheDocument();
    expect(screen.getByText('Cinematography')).toBeInTheDocument();
    expect(screen.getByText('Emotional Impact')).toBeInTheDocument();
    expect(screen.queryByText('Entertainment')).not.toBeInTheDocument();

    const includeButtons = screen.getAllByRole('button', { name: 'Include' });
    expect(includeButtons).toHaveLength(2);
  });

  it('calls includeInDimension mutation when Include is clicked', async () => {
    comparisonsScoresMock.mockResolvedValue(
      ok({ data: [{ dimensionId: 1, score: 1500, comparisonCount: 5, excluded: true }] })
    );

    const user = userEvent.setup();
    renderExcluded({ mediaType: 'movie', mediaId: 42 });

    await user.click(await screen.findByRole('button', { name: 'Include' }));

    await waitFor(() =>
      expect(comparisonsIncludeInDimensionMock).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 42, dimensionId: 1 },
      })
    );
  });

  it('renders nothing when scores are empty', async () => {
    comparisonsScoresMock.mockResolvedValue(ok({ data: [] }));

    const { container } = renderExcluded({ mediaType: 'movie', mediaId: 42 });
    await waitFor(() => expect(comparisonsScoresMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('renders nothing when scores data is null', async () => {
    comparisonsScoresMock.mockResolvedValue(ok({ data: [] }));

    const { container } = renderExcluded({ mediaType: 'movie', mediaId: 42 });
    await waitFor(() => expect(comparisonsScoresMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
