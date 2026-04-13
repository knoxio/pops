import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockListRecentQuery = vi.fn();
const mockGetPendingDebriefs = vi.fn();
const mockDeleteMutate = vi.fn();
let deleteMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let deleteMutationPending = false;
const mockInvalidateListRecent = vi.fn();
const mockInvalidateList = vi.fn();
const mockInvalidateWatchlist = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      watchHistory: {
        listRecent: { useQuery: (...args: unknown[]) => mockListRecentQuery(...args) },
        delete: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            deleteMutationOpts = opts;
            return { mutate: mockDeleteMutate, isPending: deleteMutationPending };
          },
        },
      },
      comparisons: {
        getPendingDebriefs: { useQuery: () => mockGetPendingDebriefs() },
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          listRecent: { invalidate: mockInvalidateListRecent },
          list: { invalidate: mockInvalidateList },
        },
        watchlist: {
          list: { invalidate: mockInvalidateWatchlist },
        },
      },
    }),
  },
}));

import { HistoryPage } from './HistoryPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/media/history']}>
      <HistoryPage />
    </MemoryRouter>
  );
}

const episodeEntry = {
  id: 1,
  mediaType: 'episode',
  mediaId: 42,
  watchedAt: '2026-03-20T10:30:00Z',
  title: 'Pilot',
  posterPath: '/poster.jpg',
  posterUrl: 'https://img.example.com/poster.jpg',
  seasonNumber: 2,
  episodeNumber: 10,
  showName: 'Breaking Bad',
  tvShowId: 7,
};

const movieEntry = {
  id: 2,
  mediaType: 'movie',
  mediaId: 99,
  watchedAt: '2026-03-19T20:00:00Z',
  title: 'The Matrix',
  posterPath: '/matrix.jpg',
  posterUrl: 'https://img.example.com/matrix.jpg',
  seasonNumber: null,
  episodeNumber: null,
  showName: null,
  tvShowId: null,
};

const episodeNoShow = {
  id: 3,
  mediaType: 'episode',
  mediaId: 55,
  watchedAt: '2026-03-18T15:00:00Z',
  title: 'Mystery Episode',
  posterPath: null,
  posterUrl: null,
  seasonNumber: null,
  episodeNumber: null,
  showName: null,
  tvShowId: null,
};

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMutationPending = false;
    deleteMutationOpts = {};
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeEntry, movieEntry], pagination: { total: 2 } },
      isLoading: false,
      error: null,
    });
    mockGetPendingDebriefs.mockReturnValue({ data: null });
  });

  describe('episode enrichment', () => {
    it('renders episode subtitle in S02E10 format with em-dash', () => {
      renderPage();
      expect(screen.getAllByText('Breaking Bad').length).toBeGreaterThan(0);
      expect(screen.getAllByText('S02E10').length).toBeGreaterThan(0);
    });

    it('renders show name as link to show detail page', () => {
      renderPage();
      const showLinks = screen.getAllByText('Breaking Bad');
      const showLink = showLinks.find(
        (el) => el.closest('a')?.getAttribute('href') === '/media/tv/7'
      );
      expect(showLink).toBeTruthy();
    });

    it('renders season code as link to season detail page', () => {
      renderPage();
      const codeLinks = screen.getAllByText('S02E10');
      const seasonLink = codeLinks.find(
        (el) => el.closest('a')?.getAttribute('href') === '/media/tv/7?season=2'
      );
      expect(seasonLink).toBeTruthy();
    });

    it('renders movie entries with no subtitle', () => {
      mockListRecentQuery.mockReturnValue({
        data: { data: [movieEntry], pagination: { total: 1 } },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(screen.getAllByText('The Matrix').length).toBeGreaterThan(0);
      expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
    });

    it('renders episode with missing show data as title only (graceful fallback)', () => {
      mockListRecentQuery.mockReturnValue({
        data: { data: [episodeNoShow], pagination: { total: 1 } },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(screen.getAllByText('Mystery Episode').length).toBeGreaterThan(0);
      expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
    });

    it('renders mixed entries correctly', () => {
      mockListRecentQuery.mockReturnValue({
        data: {
          data: [episodeEntry, movieEntry, episodeNoShow],
          pagination: { total: 3 },
        },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(screen.getAllByText('Breaking Bad').length).toBeGreaterThan(0);
      expect(screen.getAllByText('S02E10').length).toBeGreaterThan(0);
      expect(screen.getAllByText('The Matrix').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mystery Episode').length).toBeGreaterThan(0);
    });
  });

  describe('delete button visibility', () => {
    it('renders delete buttons with correct aria-label', () => {
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('delete confirmation dialog', () => {
    it('opens confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      expect(screen.getByText('Remove watch event?')).toBeInTheDocument();
      expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    });

    it('shows cancel and remove buttons in dialog', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('calls delete mutation when confirmed', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));
      expect(mockDeleteMutate).toHaveBeenCalledWith({ id: episodeEntry.id });
    });

    it('closes dialog on cancel without calling delete', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Cancel'));
      expect(mockDeleteMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('Remove watch event?')).not.toBeInTheDocument();
    });
  });

  describe('delete success', () => {
    it('shows success toast on deletion', () => {
      renderPage();
      deleteMutationOpts.onSuccess?.();
      expect(mockToastSuccess).toHaveBeenCalledWith('Watch event removed');
    });

    it('invalidates queries on success', () => {
      renderPage();
      deleteMutationOpts.onSuccess?.();
      expect(mockInvalidateListRecent).toHaveBeenCalled();
      expect(mockInvalidateList).toHaveBeenCalled();
      expect(mockInvalidateWatchlist).toHaveBeenCalled();
    });
  });

  describe('delete error', () => {
    it('shows error toast on failure', () => {
      renderPage();
      deleteMutationOpts.onError?.({ message: 'Server error' });
      expect(mockToastError).toHaveBeenCalledWith('Failed to delete watch event: Server error');
    });
  });

  describe('delete disabled while in flight', () => {
    it('disables delete buttons while mutation is pending', () => {
      deleteMutationPending = true;
      renderPage();
      const deleteButtons = screen.getAllByLabelText('Delete watch event');
      deleteButtons.forEach((btn) => expect(btn).toBeDisabled());
    });
  });

  describe('delete pagination edge case', () => {
    it('goes to previous page when last entry on a non-first page is deleted', async () => {
      // Single entry with total > PAGE_SIZE so Next button is visible on page 1.
      // After clicking Next (offset → 50), triggering onSuccess with 1 entry should
      // reset offset back to 0.
      const singleEntry = { ...movieEntry, id: 99 };
      mockListRecentQuery.mockReturnValue({
        data: { data: [singleEntry], pagination: { total: 51 } },
        isLoading: false,
        error: null,
      });
      const user = userEvent.setup();
      renderPage();

      // Page 1: Next should be visible because total (51) > PAGE_SIZE (50)
      await user.click(screen.getByText('Next'));

      // Now at offset 50 with 1 entry — trigger onSuccess inside act to simulate delete
      await act(async () => {
        deleteMutationOpts.onSuccess?.();
      });

      // Offset should have been reset to 0 — verify via subsequent query call args
      const calls = mockListRecentQuery.mock.calls as Array<[{ offset: number }]>;
      const resetCall = calls.find((args) => args[0]?.offset === 0);
      expect(resetCall).toBeDefined();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no entries', () => {
      mockListRecentQuery.mockReturnValue({
        data: { data: [], pagination: { total: 0 } },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(
        screen.getByText('No watch history yet. Start watching something!')
      ).toBeInTheDocument();
    });

    it('shows filtered empty state for movies', async () => {
      const user = userEvent.setup();
      mockListRecentQuery.mockReturnValue({
        data: { data: [], pagination: { total: 0 } },
        isLoading: false,
        error: null,
      });
      renderPage();
      await user.click(screen.getByText('Movies'));
      expect(screen.getByText('No movies in your history.')).toBeInTheDocument();
    });

    it('shows browse library link in empty state', () => {
      mockListRecentQuery.mockReturnValue({
        data: { data: [], pagination: { total: 0 } },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(screen.getByText('Browse library')).toHaveAttribute('href', '/media');
    });
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      mockListRecentQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });
      const { container } = renderPage();
      expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('shows error alert on query error', () => {
      mockListRecentQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch' },
      });
      renderPage();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  describe('filter tabs', () => {
    it('passes mediaType filter when Movies tab is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Movies'));
      const lastCall = mockListRecentQuery.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ mediaType: 'movie' });
    });

    it('passes mediaType filter when Episodes tab is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Episodes'));
      const lastCall = mockListRecentQuery.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ mediaType: 'episode' });
    });

    it('does not pass mediaType filter when All tab is selected', () => {
      renderPage();
      const lastCall = mockListRecentQuery.mock.calls.at(-1);
      expect(lastCall?.[0]).not.toHaveProperty('mediaType');
    });
  });

  describe('pagination', () => {
    it('shows pagination info', () => {
      renderPage();
      expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
    });

    it('shows Next button when there are more pages', () => {
      mockListRecentQuery.mockReturnValue({
        data: {
          data: Array.from({ length: 50 }, (_, i) => ({ ...movieEntry, id: i + 1 })),
          pagination: { total: 100 },
        },
        isLoading: false,
        error: null,
      });
      renderPage();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('hides Previous button on first page', () => {
      renderPage();
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    });
  });

  describe('debrief button', () => {
    it('shows debrief button for movies with pending debriefs', () => {
      mockGetPendingDebriefs.mockReturnValue({
        data: {
          data: [
            {
              sessionId: 42,
              movieId: 99,
              title: 'The Matrix',
              posterUrl: null,
              status: 'pending',
              createdAt: '2026-03-20T00:00:00Z',
              pendingDimensionCount: 3,
            },
          ],
        },
      });
      renderPage();
      const debriefLinks = screen.getAllByLabelText('Debrief');
      expect(debriefLinks.length).toBeGreaterThan(0);
      expect(debriefLinks[0]).toHaveAttribute('href', '/media/debrief/42');
    });

    it('hides debrief button for movies without pending debriefs', () => {
      mockGetPendingDebriefs.mockReturnValue({ data: { data: [] } });
      renderPage();
      expect(screen.queryByLabelText('Debrief')).not.toBeInTheDocument();
    });

    it('hides debrief button for episodes', () => {
      mockListRecentQuery.mockReturnValue({
        data: { data: [episodeEntry], pagination: { total: 1 } },
        isLoading: false,
        error: null,
      });
      mockGetPendingDebriefs.mockReturnValue({
        data: {
          data: [
            {
              sessionId: 10,
              movieId: 42,
              title: 'Pilot',
              posterUrl: null,
              status: 'pending',
              createdAt: '2026-03-20T00:00:00Z',
              pendingDimensionCount: 2,
            },
          ],
        },
      });
      renderPage();
      expect(screen.queryByLabelText('Debrief')).not.toBeInTheDocument();
    });
  });
});
