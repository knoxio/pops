import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock tRPC hooks
const mockScoresQuery = vi.fn();
const mockDimensionsQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        scores: { useQuery: (...args: unknown[]) => mockScoresQuery(...args) },
        listDimensions: { useQuery: () => mockDimensionsQuery() },
      },
    },
  },
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

beforeEach(() => {
  mockScoresQuery.mockReturnValue({
    data: { data: baseScores },
    isLoading: false,
  });
  mockDimensionsQuery.mockReturnValue({
    data: { data: baseDimensions },
    isLoading: false,
  });
});

describe('ComparisonScores', () => {
  describe('chart renders with scores', () => {
    it('renders radar chart when sufficient comparisons exist', () => {
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(screen.getByText('Comparison Scores')).toBeInTheDocument();
    });

    it('passes correct number of data points to radar chart', () => {
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '3');
    });
  });

  describe('hidden when no comparisons', () => {
    it('returns null when totalComparisons is zero', () => {
      mockScoresQuery.mockReturnValue({
        data: { data: [] },
        isLoading: false,
      });
      const { container } = render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(container.innerHTML).toBe('');
    });

    it('returns null when all scores have zero comparisonCount', () => {
      mockScoresQuery.mockReturnValue({
        data: {
          data: [
            { dimensionId: 1, score: 1000, comparisonCount: 0 },
            { dimensionId: 2, score: 1000, comparisonCount: 0 },
          ],
        },
        isLoading: false,
      });
      const { container } = render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('placeholder for 1-2 comparisons', () => {
    it('shows placeholder when totalComparisons is 1', () => {
      mockScoresQuery.mockReturnValue({
        data: {
          data: [{ dimensionId: 1, score: 1200, comparisonCount: 1 }],
        },
        isLoading: false,
      });
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(
        screen.getByText('Not enough data — at least 3 comparisons needed')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('shows placeholder when totalComparisons is 2', () => {
      mockScoresQuery.mockReturnValue({
        data: {
          data: [
            { dimensionId: 1, score: 1200, comparisonCount: 1 },
            { dimensionId: 2, score: 1300, comparisonCount: 1 },
          ],
        },
        isLoading: false,
      });
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(
        screen.getByText('Not enough data — at least 3 comparisons needed')
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
      mockScoresQuery.mockReturnValue({ data: null, isLoading: true });
      mockDimensionsQuery.mockReturnValue({ data: null, isLoading: true });
      const { container } = render(<ComparisonScores mediaType="movie" mediaId={1} />);
      expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    });
  });

  describe('axis count', () => {
    it('renders correct number of axes matching dimensions', () => {
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      // The radar chart receives 3 data points (one per dimension with scores)
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '3');
    });

    it('renders chart with fewer axes when fewer dimensions have scores', () => {
      mockScoresQuery.mockReturnValue({
        data: {
          data: [
            { dimensionId: 1, score: 1500, comparisonCount: 3 },
            { dimensionId: 2, score: 1300, comparisonCount: 2 },
          ],
        },
        isLoading: false,
      });
      render(<ComparisonScores mediaType="movie" mediaId={1} />);
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-points', '2');
    });
  });
});
