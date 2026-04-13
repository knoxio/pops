import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockMutate = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        recordDebriefComparison: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            mutationOpts = opts;
            return { mutate: mockMutate, isPending: false };
          },
        },
      },
    },
  },
}));

import { DebriefComparisonCard, DebriefComparisonCardSkeleton } from './DebriefComparisonCard';

const movieA = {
  id: 1,
  title: 'The Shawshank Redemption',
  year: 1994,
  posterUrl: '/media/images/movie/278/poster.jpg',
};

const movieB = {
  id: 2,
  title: 'The Godfather',
  year: '1972-03-24',
  posterUrl: '/media/images/movie/238/poster.jpg',
};

describe('DebriefComparisonCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationOpts = {};
  });

  it('renders both movie posters side by side', () => {
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    expect(screen.getByTestId('debrief-comparison-card')).toBeInTheDocument();
    expect(screen.getByText('The Shawshank Redemption')).toBeInTheDocument();
    expect(screen.getByText('The Godfather')).toBeInTheDocument();
  });

  it('renders movie years (number and string)', () => {
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    expect(screen.getByText('1994')).toBeInTheDocument();
    expect(screen.getByText('1972')).toBeInTheDocument();
  });

  it('renders poster images with alt text', () => {
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    expect(screen.getByAltText('The Shawshank Redemption poster')).toBeInTheDocument();
    expect(screen.getByAltText('The Godfather poster')).toBeInTheDocument();
  });

  it('calls recordDebriefComparison when user picks a winner', async () => {
    const user = userEvent.setup();
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={3}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText('Pick The Shawshank Redemption'));

    expect(mockMutate).toHaveBeenCalledWith({
      sessionId: 10,
      dimensionId: 3,
      opponentType: 'movie',
      opponentId: 2,
      winnerId: 1,
    });
  });

  it('calls onResult after successful mutation', () => {
    const onResult = vi.fn();
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={onResult}
      />
    );

    // Simulate mutation success
    mutationOpts.onSuccess?.({ data: { comparisonId: 42, sessionComplete: false } });
    expect(onResult).toHaveBeenCalledWith({ comparisonId: 42, sessionComplete: false });
  });

  it('calls onResult with sessionComplete=true when session finishes', () => {
    const onResult = vi.fn();
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={onResult}
      />
    );

    mutationOpts.onSuccess?.({ data: { comparisonId: 99, sessionComplete: true } });
    expect(onResult).toHaveBeenCalledWith({ comparisonId: 99, sessionComplete: true });
  });

  it('shows placeholder when posterUrl is null', () => {
    const noPosterA = { ...movieA, posterUrl: null };
    const noPosterB = { ...movieB, posterUrl: null };

    render(
      <DebriefComparisonCard
        movieA={noPosterA}
        movieB={noPosterB}
        dimensionId={1}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    // No img elements since posterUrl is null
    expect(screen.queryByAltText('The Shawshank Redemption poster')).not.toBeInTheDocument();
    expect(screen.queryByAltText('The Godfather poster')).not.toBeInTheDocument();
  });

  it('renders pick buttons with accessible labels', () => {
    render(
      <DebriefComparisonCard
        movieA={movieA}
        movieB={movieB}
        dimensionId={1}
        sessionId={10}
        onResult={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Pick The Shawshank Redemption')).toBeInTheDocument();
    expect(screen.getByLabelText('Pick The Godfather')).toBeInTheDocument();
  });
});

describe('DebriefComparisonCardSkeleton', () => {
  it('renders skeleton loading state', () => {
    const { container } = render(<DebriefComparisonCardSkeleton />);
    // 2 skeleton card containers
    const skeletons = container.querySelectorAll('.grid > div');
    expect(skeletons.length).toBe(2);
  });
});
