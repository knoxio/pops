import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDebrief = vi.fn();
const mockScores = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        getDebrief: {
          useQuery: (...args: unknown[]) => mockGetDebrief(...args),
        },
        scores: {
          useQuery: (...args: unknown[]) => mockScores(...args),
        },
      },
    },
  },
}));

import { DebriefResultsSummary } from './DebriefResultsSummary';

const debriefResponse = {
  data: {
    sessionId: 1,
    status: 'complete',
    movie: {
      mediaType: 'movie',
      mediaId: 42,
      title: 'The Matrix',
      posterPath: null,
      posterUrl: null,
    },
    dimensions: [
      {
        dimensionId: 1,
        name: 'Cinematography',
        status: 'complete',
        comparisonId: 10,
        opponent: null,
      },
      {
        dimensionId: 2,
        name: 'Entertainment',
        status: 'complete',
        comparisonId: null,
        opponent: null,
      },
      {
        dimensionId: 3,
        name: 'Rewatchability',
        status: 'pending',
        comparisonId: null,
        opponent: null,
      },
    ],
  },
};

const scoresResponse = {
  data: [
    { dimensionId: 1, score: 1545 },
    { dimensionId: 2, score: 1500 },
    { dimensionId: 3, score: 1475 },
  ],
};

function renderComponent(mediaId = 42) {
  return render(
    <MemoryRouter>
      <DebriefResultsSummary mediaType="movie" mediaId={mediaId} />
    </MemoryRouter>
  );
}

describe('DebriefResultsSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDebrief.mockReturnValue({
      data: debriefResponse,
      isLoading: false,
      error: null,
    });
    mockScores.mockReturnValue({ data: scoresResponse });
  });

  it('renders dimension results with correct badges', () => {
    renderComponent();

    expect(screen.getByTestId('debrief-results-summary')).toBeInTheDocument();
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    // Dimension names appear twice (results + scores sections)
    expect(screen.getAllByText('Cinematography')).toHaveLength(2);
    expect(screen.getByText('Compared')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows compared and skipped counts', () => {
    renderComponent();
    expect(screen.getByText('1 compared, 1 skipped, 1 pending')).toBeInTheDocument();
  });

  it('renders score deltas with correct colors', () => {
    renderComponent();

    const positiveDelta = screen.getByTestId('score-delta-1');
    expect(positiveDelta).toHaveTextContent('+45');
    expect(positiveDelta.className).toContain('success');

    const neutralDelta = screen.getByTestId('score-delta-2');
    expect(neutralDelta).toHaveTextContent('0');
    expect(neutralDelta.className).toContain('muted');

    const negativeDelta = screen.getByTestId('score-delta-3');
    expect(negativeDelta).toHaveTextContent('-25');
    expect(negativeDelta.className).toContain('destructive');
  });

  it('back to movie button links to movie detail', () => {
    renderComponent();

    const btn = screen.getByTestId('back-to-movie-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Back to Movie');
  });

  it('done button is rendered', () => {
    renderComponent();
    expect(screen.getByTestId('done-btn')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    mockGetDebrief.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    mockScores.mockReturnValue({ data: undefined });

    renderComponent();
    expect(screen.getByTestId('results-loading')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockGetDebrief.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Session not found' },
    });
    mockScores.mockReturnValue({ data: undefined });

    renderComponent();
    expect(screen.getByTestId('results-error')).toBeInTheDocument();
    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });
});
