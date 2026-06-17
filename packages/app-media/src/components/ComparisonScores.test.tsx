import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeScore } from './ComparisonScores';

// Mock recharts to avoid rendering SVG in jsdom
vi.mock('recharts', () => ({
  RadarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="radar-chart" data-points={data.length}>
      {children}
    </div>
  ),
  PolarGrid: () => <div data-testid="polar-grid" />,
  PolarAngleAxis: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="polar-angle-axis" data-key={dataKey} />
  ),
  Radar: ({ dataKey }: { dataKey: string }) => <div data-testid="radar" data-key={dataKey} />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => <div data-testid="tooltip" />,
}));

const comparisonsScoresMock = vi.hoisted(() => vi.fn());
const comparisonsListDimensionsMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  comparisonsScores: (...args: unknown[]) => comparisonsScoresMock(...args),
  comparisonsListDimensions: (...args: unknown[]) => comparisonsListDimensionsMock(...args),
}));

import { ComparisonScores } from './ComparisonScores';

const baseDimensions = [
  { id: 1, name: 'Story', sortOrder: 1 },
  { id: 2, name: 'Acting', sortOrder: 2 },
  { id: 3, name: 'Visuals', sortOrder: 3 },
];

const baseScores = [
  { dimensionId: 1, score: 1500, comparisonCount: 5 },
  { dimensionId: 2, score: 1300, comparisonCount: 4 },
  { dimensionId: 3, score: 1700, comparisonCount: 3 },
];

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderScores(props: { mediaType: 'movie' | 'tv_show'; mediaId: number }) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<ComparisonScores {...props} />, { wrapper });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  comparisonsScoresMock.mockResolvedValue(ok({ data: baseScores }));
  comparisonsListDimensionsMock.mockResolvedValue(ok({ data: baseDimensions }));
});

describe('ComparisonScores', () => {
  describe('chart renders with scores', () => {
    it('renders radar chart when sufficient comparisons exist', async () => {
      renderScores({ mediaType: 'movie', mediaId: 1 });
      expect(await screen.findByTestId('radar-chart')).toBeInTheDocument();
      expect(screen.getByText('Comparison Scores')).toBeInTheDocument();
    });

    it('passes correct number of data points to radar chart', async () => {
      renderScores({ mediaType: 'movie', mediaId: 1 });
      const chart = await screen.findByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '3');
    });
  });

  describe('hidden when no comparisons', () => {
    it('returns null when totalComparisons is zero', async () => {
      comparisonsScoresMock.mockResolvedValue(ok({ data: [] }));
      const { container } = renderScores({ mediaType: 'movie', mediaId: 1 });
      await waitFor(() => expect(comparisonsScoresMock).toHaveBeenCalled());
      await waitFor(() => expect(container.innerHTML).toBe(''));
    });

    it('returns null when all scores have zero comparisonCount', async () => {
      comparisonsScoresMock.mockResolvedValue(
        ok({
          data: [
            { dimensionId: 1, score: 1000, comparisonCount: 0 },
            { dimensionId: 2, score: 1000, comparisonCount: 0 },
          ],
        })
      );
      const { container } = renderScores({ mediaType: 'movie', mediaId: 1 });
      await waitFor(() => expect(comparisonsScoresMock).toHaveBeenCalled());
      await waitFor(() => expect(container.innerHTML).toBe(''));
    });
  });

  describe('placeholder for 1-2 comparisons', () => {
    it('shows placeholder when totalComparisons is 1', async () => {
      comparisonsScoresMock.mockResolvedValue(
        ok({ data: [{ dimensionId: 1, score: 1200, comparisonCount: 1 }] })
      );
      renderScores({ mediaType: 'movie', mediaId: 1 });
      expect(
        await screen.findByText('Not enough data — at least 3 comparisons needed')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('shows placeholder when totalComparisons is 2', async () => {
      comparisonsScoresMock.mockResolvedValue(
        ok({
          data: [
            { dimensionId: 1, score: 1200, comparisonCount: 1 },
            { dimensionId: 2, score: 1300, comparisonCount: 1 },
          ],
        })
      );
      renderScores({ mediaType: 'movie', mediaId: 1 });
      expect(
        await screen.findByText('Not enough data — at least 3 comparisons needed')
      ).toBeInTheDocument();
    });
  });

  describe('score normalisation', () => {
    it('maps Elo 1000 to 0', () => {
      expect(normalizeScore(1000)).toBe(0);
    });

    it('maps Elo 1500 to 50', () => {
      expect(normalizeScore(1500)).toBe(50);
    });

    it('maps Elo 2000 to 100', () => {
      expect(normalizeScore(2000)).toBe(100);
    });

    it('clamps below 1000 to 0', () => {
      expect(normalizeScore(800)).toBe(0);
    });

    it('clamps above 2000 to 100', () => {
      expect(normalizeScore(2500)).toBe(100);
    });
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      comparisonsScoresMock.mockReturnValue(new Promise(() => {}));
      comparisonsListDimensionsMock.mockReturnValue(new Promise(() => {}));
      const { container } = renderScores({ mediaType: 'movie', mediaId: 1 });
      expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    });
  });

  describe('axis count', () => {
    it('renders correct number of axes matching dimensions', async () => {
      renderScores({ mediaType: 'movie', mediaId: 1 });
      const chart = await screen.findByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '3');
    });

    it('renders chart with fewer axes when fewer dimensions have scores', async () => {
      comparisonsScoresMock.mockResolvedValue(
        ok({
          data: [
            { dimensionId: 1, score: 1500, comparisonCount: 3 },
            { dimensionId: 2, score: 1300, comparisonCount: 2 },
          ],
        })
      );
      renderScores({ mediaType: 'movie', mediaId: 1 });
      const chart = await screen.findByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '2');
    });
  });
});
