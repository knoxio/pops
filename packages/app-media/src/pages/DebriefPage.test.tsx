import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

// ── Mocks ──

const mockDebriefQuery = vi.fn();
const mockRecordMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockDismissMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockInvalidateDebrief = vi.fn();
const mockInvalidatePending = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        getDebrief: {
          useQuery: (...args: unknown[]) => {
            const result = mockDebriefQuery(...args);
            return { ...result, refetch: vi.fn() };
          },
        },
        recordDebriefComparison: {
          useMutation: (opts: Record<string, unknown>) => {
            mockRecordMutate._opts = opts;
            return { mutate: mockRecordMutate, isPending: false };
          },
        },
        dismissDebriefDimension: {
          useMutation: (opts: Record<string, unknown>) => {
            mockDismissMutate._opts = opts;
            return { mutate: mockDismissMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          getDebrief: { invalidate: mockInvalidateDebrief },
          getPendingDebriefs: { invalidate: mockInvalidatePending },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DebriefPage } from './DebriefPage';

// ── Helpers ──

function renderWithMovie(movieId: string) {
  return render(
    <MemoryRouter initialEntries={[`/media/debrief/${movieId}`]}>
      <TooltipProvider>
        <Routes>
          <Route path="/media/debrief/:movieId" element={<DebriefPage />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>
  );
}

const mockDebrief = {
  sessionId: 42,
  status: 'active',
  movie: {
    mediaType: 'movie',
    mediaId: 10,
    title: 'Inception',
    posterPath: '/poster.jpg',
    posterUrl: '/media/images/movie/27205/poster.jpg',
  },
  dimensions: [
    {
      dimensionId: 1,
      name: 'Story',
      status: 'pending',
      comparisonId: null,
      opponent: {
        id: 20,
        title: 'The Matrix',
        posterPath: '/matrix.jpg',
        posterUrl: '/media/images/movie/603/poster.jpg',
      },
    },
    {
      dimensionId: 2,
      name: 'Visuals',
      status: 'pending',
      comparisonId: null,
      opponent: {
        id: 30,
        title: 'Avatar',
        posterPath: '/avatar.jpg',
        posterUrl: '/media/images/movie/19995/poster.jpg',
      },
    },
  ],
};

const completedDebrief = {
  ...mockDebrief,
  status: 'complete',
  dimensions: [
    {
      dimensionId: 1,
      name: 'Story',
      status: 'complete',
      comparisonId: 100,
      opponent: null,
    },
    {
      dimensionId: 2,
      name: 'Visuals',
      status: 'complete',
      comparisonId: null,
      opponent: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──

describe('DebriefPage', () => {
  it('shows loading skeleton while fetching', () => {
    mockDebriefQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderWithMovie('42');
    expect(screen.getByTestId('debrief-loading')).toBeInTheDocument();
  });

  it('renders movie title and poster header', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    const header = screen.getByTestId('debrief-header');
    expect(header).toBeInTheDocument();
    expect(header.querySelector('h1')).toHaveTextContent('Inception');
    expect(header.querySelector('img')).toHaveAttribute('alt', 'Inception poster');
  });

  it('renders dimension progress badges', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    const progress = screen.getByTestId('dimension-progress');
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveTextContent('Story');
    expect(progress).toHaveTextContent('Visuals');
  });

  it('renders comparison cards with movie and opponent', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    expect(screen.getByTestId('comparison-cards')).toBeInTheDocument();
    expect(screen.getByTestId('pick-a')).toBeInTheDocument();
    expect(screen.getByTestId('pick-b')).toBeInTheDocument();
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
  });

  it('calls recordDebriefComparison when picking movie A', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('pick-a'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 10,
    });
  });

  it('calls recordDebriefComparison when picking opponent (movie B)', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('pick-b'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 20,
    });
  });

  it('calls recordDebriefComparison with winnerId=0 for draw', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('draw-mid'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 0,
      drawTier: 'mid',
    });
  });

  it('calls dismissDebriefDimension when skip button clicked', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: mockDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('skip-dimension-btn'));
    expect(mockDismissMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
    });
  });

  it('shows completion summary when all dimensions are complete', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: completedDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    expect(screen.getByTestId('completion-summary')).toBeInTheDocument();
    expect(screen.getByText('Debrief Complete')).toBeInTheDocument();
    expect(screen.queryByTestId('comparison-cards')).not.toBeInTheDocument();
  });

  it('shows error state when session not found', () => {
    mockDebriefQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Session not found' },
    });
    renderWithMovie('999');

    expect(screen.getByTestId('debrief-error')).toBeInTheDocument();
    expect(screen.getByText('Could not load debrief')).toBeInTheDocument();
  });

  it('shows invalid movie message for non-numeric ID', () => {
    mockDebriefQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    renderWithMovie('abc');

    expect(screen.getByText('Invalid movie ID.')).toBeInTheDocument();
  });
});
