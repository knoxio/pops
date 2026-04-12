import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

const mockListQuery = vi.fn();
const mockGenresQuery = vi.fn();
const mockRefetch = vi.fn();
const mockGetPendingDebriefs = vi.fn();

const mockGetLeavingMovies = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      library: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        genres: { useQuery: () => mockGenresQuery() },
      },
      comparisons: {
        getPendingDebriefs: { useQuery: () => mockGetPendingDebriefs() },
      },
      rotation: {
        getLeavingMovies: { useQuery: () => mockGetLeavingMovies() },
        cancelLeaving: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}));

vi.mock('../components/MediaGrid', () => ({
  MediaGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="media-grid">{children}</div>
  ),
}));

vi.mock('../components/MediaCard', () => ({
  MediaCard: ({ title }: { title: string }) => <div data-testid="media-card">{title}</div>,
}));

vi.mock('../components/DownloadQueue', () => ({
  DownloadQueue: () => <div data-testid="download-queue" />,
}));

vi.mock('../components/LeavingSoonShelf', () => ({
  LeavingSoonShelf: () => <div data-testid="leaving-soon-shelf" />,
}));

vi.mock('../components/QuickPickDialog', () => ({
  QuickPickDialog: () => null,
}));

import { LibraryPage } from './LibraryPage';

function renderPage(initialPath = '/media') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/media" element={<LibraryPage />} />
        <Route path="/media/search" element={<div data-testid="search-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

const emptyList = {
  data: {
    data: [],
    pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0, hasMore: false },
  },
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

const populatedList = {
  data: {
    data: [
      {
        id: 1,
        type: 'movie',
        title: 'Inception',
        year: 2010,
        posterUrl: null,
        genres: ['Sci-Fi'],
        voteAverage: 8.8,
        createdAt: '2026-01-01',
        releaseDate: '2010-07-16',
      },
      {
        id: 2,
        type: 'tv',
        title: 'Breaking Bad',
        year: 2008,
        posterUrl: null,
        genres: ['Drama'],
        voteAverage: 9.5,
        createdAt: '2026-01-02',
        releaseDate: '2008-01-20',
      },
    ],
    pagination: { page: 1, pageSize: 24, total: 2, totalPages: 1, hasMore: false },
  },
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenresQuery.mockReturnValue({ data: { data: ['Drama', 'Sci-Fi'] } });
    mockGetPendingDebriefs.mockReturnValue({ data: null });
    mockGetLeavingMovies.mockReturnValue({ data: [], isLoading: false });
  });

  describe('Loading state', () => {
    it('renders skeleton cards while loading', () => {
      mockListQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });
      renderPage();

      const grid = screen.getByTestId('media-grid');
      // Default page size is 24, so 24 skeleton groups (each with 3 Skeleton divs)
      const skeletons = grid.querySelectorAll('.space-y-2');
      expect(skeletons.length).toBe(24);
    });

    it('renders skeleton count matching pageSize param', () => {
      mockListQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });
      renderPage('/media?pageSize=48');

      const grid = screen.getByTestId('media-grid');
      const skeletons = grid.querySelectorAll('.space-y-2');
      expect(skeletons.length).toBe(48);
    });
  });

  describe('Error state', () => {
    it('renders error message with retry button', () => {
      mockListQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });
      renderPage();

      expect(screen.getByText('Something went wrong loading your library.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('calls refetch when Retry is clicked', async () => {
      mockListQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });
      renderPage();

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('does not expose technical error details', () => {
      mockListQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('TRPC_INTERNAL_ERROR: connection refused at postgres:5432'),
        refetch: mockRefetch,
      });
      renderPage();

      expect(screen.queryByText(/TRPC_INTERNAL_ERROR/)).not.toBeInTheDocument();
      expect(screen.queryByText(/postgres/)).not.toBeInTheDocument();
      expect(screen.getByText('Something went wrong loading your library.')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty library message when no items exist', () => {
      mockListQuery.mockReturnValue(emptyList);
      renderPage();

      expect(
        screen.getByText('Your library is empty. Search for movies and shows to get started.')
      ).toBeInTheDocument();
      expect(screen.getByText('Search for media')).toBeInTheDocument();
    });

    it('links to search page from empty state', () => {
      mockListQuery.mockReturnValue(emptyList);
      renderPage();

      const link = screen.getByText('Search for media');
      expect(link.closest('a')).toHaveAttribute('href', '/media/search');
    });
  });

  describe('Empty search state', () => {
    it("shows 'No results for' message with the search query", () => {
      mockListQuery.mockReturnValue({
        data: {
          data: [],
          pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderPage('/media?q=xyznonexistent');

      expect(screen.getByText(/No results for/)).toBeInTheDocument();
      expect(screen.getByText(/xyznonexistent/)).toBeInTheDocument();
    });

    it('shows Clear search button when search has no results', () => {
      mockListQuery.mockReturnValue({
        data: {
          data: [],
          pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderPage('/media?q=xyznonexistent');

      expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    });

    it('shows generic filter message when no search query', () => {
      mockListQuery.mockReturnValue({
        data: {
          data: [],
          pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderPage('/media?type=movie&genre=Horror');

      expect(screen.getByText('No results match your filters.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    });
  });

  describe('Populated state', () => {
    it('renders media cards when data is loaded', () => {
      mockListQuery.mockReturnValue(populatedList);
      renderPage();

      expect(screen.getByText('Inception')).toBeInTheDocument();
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });
  });

  describe('Debrief banner', () => {
    it('shows debrief banner when pending debriefs exist', () => {
      mockListQuery.mockReturnValue(emptyList);
      mockGetPendingDebriefs.mockReturnValue({
        data: {
          data: [
            {
              sessionId: 42,
              movieId: 1,
              title: 'The Matrix',
              posterUrl: null,
              status: 'pending',
              createdAt: '2026-04-01T00:00:00Z',
              pendingDimensionCount: 3,
            },
          ],
        },
      });
      renderPage();
      expect(screen.getByTestId('debrief-banner')).toBeInTheDocument();
      expect(screen.getByText('1 movie to debrief')).toBeInTheDocument();
    });

    it('hides debrief banner when no pending debriefs', () => {
      mockListQuery.mockReturnValue(emptyList);
      mockGetPendingDebriefs.mockReturnValue({ data: { data: [] } });
      renderPage();
      expect(screen.queryByTestId('debrief-banner')).not.toBeInTheDocument();
    });

    it('dismissing banner hides it without affecting library items', async () => {
      const user = userEvent.setup();
      mockListQuery.mockReturnValue(populatedList);
      mockGetPendingDebriefs.mockReturnValue({
        data: {
          data: [
            {
              sessionId: 42,
              movieId: 1,
              title: 'The Matrix',
              posterUrl: null,
              status: 'pending',
              createdAt: '2026-04-01T00:00:00Z',
              pendingDimensionCount: 3,
            },
          ],
        },
      });
      renderPage();
      expect(screen.getByTestId('debrief-banner')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Dismiss debrief banner'));
      expect(screen.queryByTestId('debrief-banner')).not.toBeInTheDocument();
      // Library items unaffected
      expect(screen.getAllByTestId('media-card')).toHaveLength(2);
    });
  });
});
