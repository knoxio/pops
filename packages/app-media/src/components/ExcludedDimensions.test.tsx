import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock tRPC hooks
const mockScoresQuery = vi.fn();
const mockDimensionsQuery = vi.fn();
const mockIncludeMutate = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      media: {
        comparisons: {
          scores: { invalidate: vi.fn() },
        },
      },
    }),
    media: {
      comparisons: {
        scores: { useQuery: (...args: unknown[]) => mockScoresQuery(...args) },
        listDimensions: { useQuery: () => mockDimensionsQuery() },
        includeInDimension: {
          useMutation: () => {
            return { mutate: mockIncludeMutate, isPending: false };
          },
        },
      },
    },
  },
}));

import { ExcludedDimensions } from './ExcludedDimensions';

const baseDimensions = [
  { id: 1, name: 'Cinematography' },
  { id: 2, name: 'Entertainment' },
  { id: 3, name: 'Emotional Impact' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDimensionsQuery.mockReturnValue({
    data: { data: baseDimensions },
    isLoading: false,
  });
});

describe('ExcludedDimensions', () => {
  it('renders nothing when no dimensions are excluded', () => {
    mockScoresQuery.mockReturnValue({
      data: {
        data: [
          { dimensionId: 1, score: 1500, comparisonCount: 5, excluded: false },
          { dimensionId: 2, score: 1300, comparisonCount: 4, excluded: false },
        ],
      },
      isLoading: false,
    });

    const { container } = render(<ExcludedDimensions mediaType="movie" mediaId={42} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows excluded dimensions with Include buttons', () => {
    mockScoresQuery.mockReturnValue({
      data: {
        data: [
          { dimensionId: 1, score: 1500, comparisonCount: 5, excluded: true },
          { dimensionId: 2, score: 1300, comparisonCount: 4, excluded: false },
          { dimensionId: 3, score: 1200, comparisonCount: 2, excluded: true },
        ],
      },
      isLoading: false,
    });

    render(<ExcludedDimensions mediaType="movie" mediaId={42} />);

    expect(screen.getByText('Excluded Dimensions')).toBeInTheDocument();
    expect(screen.getByText('Cinematography')).toBeInTheDocument();
    expect(screen.getByText('Emotional Impact')).toBeInTheDocument();
    expect(screen.queryByText('Entertainment')).not.toBeInTheDocument();

    const includeButtons = screen.getAllByRole('button', { name: 'Include' });
    expect(includeButtons).toHaveLength(2);
  });

  it('calls includeInDimension mutation when Include is clicked', () => {
    mockScoresQuery.mockReturnValue({
      data: {
        data: [{ dimensionId: 1, score: 1500, comparisonCount: 5, excluded: true }],
      },
      isLoading: false,
    });

    render(<ExcludedDimensions mediaType="movie" mediaId={42} />);

    fireEvent.click(screen.getByRole('button', { name: 'Include' }));

    expect(mockIncludeMutate).toHaveBeenCalledWith({
      mediaType: 'movie',
      mediaId: 42,
      dimensionId: 1,
    });
  });

  it('renders nothing when scores are empty', () => {
    mockScoresQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });

    const { container } = render(<ExcludedDimensions mediaType="movie" mediaId={42} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when scores data is null', () => {
    mockScoresQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });

    const { container } = render(<ExcludedDimensions mediaType="movie" mediaId={42} />);
    expect(container.innerHTML).toBe('');
  });
});
