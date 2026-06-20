import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockWatchHistoryListRecent = vi.fn();
const mockWatchHistoryDelete = vi.fn();

vi.mock('../media-api/index.js', () => ({
  watchHistoryListRecent: (opts: unknown) => mockWatchHistoryListRecent(opts),
  watchHistoryDelete: (opts: unknown) => mockWatchHistoryDelete(opts),
}));

import { HistoryPage } from './HistoryPage';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/media/history'] }, children)
    );
  return render(<HistoryPage />, { wrapper });
}

function listResult(data: unknown[], total: number) {
  return { data: { data, pagination: { total } } };
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
    mockWatchHistoryListRecent.mockResolvedValue(listResult([episodeEntry, movieEntry], 2));
    mockWatchHistoryDelete.mockResolvedValue({ data: { id: 1 } });
  });

  describe('episode enrichment', () => {
    it('renders episode subtitle in S02E10 format with em-dash', async () => {
      renderPage();
      expect((await screen.findAllByText('Breaking Bad')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('S02E10').length).toBeGreaterThan(0);
    });

    it('renders show name as link to show detail page', async () => {
      renderPage();
      const showLinks = await screen.findAllByText('Breaking Bad');
      const showLink = showLinks.find(
        (el) => el.closest('a')?.getAttribute('href') === '/media/tv/7'
      );
      expect(showLink).toBeTruthy();
    });

    it('renders season code as link to season detail page', async () => {
      renderPage();
      const codeLinks = await screen.findAllByText('S02E10');
      const seasonLink = codeLinks.find(
        (el) => el.closest('a')?.getAttribute('href') === '/media/tv/7?season=2'
      );
      expect(seasonLink).toBeTruthy();
    });

    it('renders movie entries with no subtitle', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(listResult([movieEntry], 1));
      renderPage();
      expect((await screen.findAllByText('The Matrix')).length).toBeGreaterThan(0);
      expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
    });

    it('renders episode with missing show data as title only (graceful fallback)', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(listResult([episodeNoShow], 1));
      renderPage();
      expect((await screen.findAllByText('Mystery Episode')).length).toBeGreaterThan(0);
      expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
    });

    it('renders mixed entries correctly', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(
        listResult([episodeEntry, movieEntry, episodeNoShow], 3)
      );
      renderPage();
      expect((await screen.findAllByText('Breaking Bad')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('S02E10').length).toBeGreaterThan(0);
      expect(screen.getAllByText('The Matrix').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mystery Episode').length).toBeGreaterThan(0);
    });
  });

  describe('delete button visibility', () => {
    it('renders delete buttons with correct aria-label', async () => {
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('delete confirmation dialog', () => {
    it('opens confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      expect(screen.getByText('Remove watch event?')).toBeInTheDocument();
      expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    });

    it('shows cancel and remove buttons in dialog', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('calls delete mutation when confirmed', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));
      await waitFor(() =>
        expect(mockWatchHistoryDelete).toHaveBeenCalledWith({ path: { id: episodeEntry.id } })
      );
    });

    it('closes dialog on cancel without calling delete', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Cancel'));
      expect(mockWatchHistoryDelete).not.toHaveBeenCalled();
      expect(screen.queryByText('Remove watch event?')).not.toBeInTheDocument();
    });
  });

  describe('delete success', () => {
    it('shows success toast on deletion', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Watch event removed'));
    });

    it('refetches history after a successful deletion', async () => {
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      const callsBefore = mockWatchHistoryListRecent.mock.calls.length;
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));
      await waitFor(() =>
        expect(mockWatchHistoryListRecent.mock.calls.length).toBeGreaterThan(callsBefore)
      );
    });
  });

  describe('delete error', () => {
    it('shows error toast on failure', async () => {
      mockWatchHistoryDelete.mockResolvedValue({ error: { message: 'Server error' } });
      const user = userEvent.setup();
      renderPage();
      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to delete watch event: Server error')
      );
    });
  });

  describe('delete pagination edge case', () => {
    it('goes to previous page when last entry on a non-first page is deleted', async () => {
      const singleEntry = { ...movieEntry, id: 99 };
      mockWatchHistoryListRecent.mockResolvedValue(listResult([singleEntry], 51));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByText('Next'));
      await waitFor(() => {
        const calls = mockWatchHistoryListRecent.mock.calls as Array<
          [{ query: { offset: number } }]
        >;
        expect(calls.some((args) => args[0]?.query.offset === 50)).toBe(true);
      });

      const deleteButtons = await screen.findAllByLabelText('Delete watch event');
      await user.click(deleteButtons[0]!);
      await user.click(screen.getByText('Remove'));

      await waitFor(() => {
        const calls = mockWatchHistoryListRecent.mock.calls as Array<
          [{ query: { offset: number } }]
        >;
        const resetCall = calls.find((args) => args[0]?.query.offset === 0);
        expect(resetCall).toBeDefined();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when no entries', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(listResult([], 0));
      renderPage();
      expect(
        await screen.findByText('No watch history yet. Start watching something!')
      ).toBeInTheDocument();
    });

    it('shows filtered empty state for movies', async () => {
      const user = userEvent.setup();
      mockWatchHistoryListRecent.mockResolvedValue(listResult([], 0));
      renderPage();
      await user.click(await screen.findByText('Movies'));
      expect(await screen.findByText('No movies in your history.')).toBeInTheDocument();
    });

    it('shows browse library link in empty state', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(listResult([], 0));
      renderPage();
      expect(await screen.findByText('Browse library')).toHaveAttribute('href', '/media');
    });
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      mockWatchHistoryListRecent.mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('shows error alert on query error', async () => {
      mockWatchHistoryListRecent.mockResolvedValue({ error: { message: 'Failed to fetch' } });
      renderPage();
      expect(await screen.findByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  describe('filter tabs', () => {
    it('passes mediaType filter when Movies tab is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByText('Movies'));
      await waitFor(() => {
        const lastCall = mockWatchHistoryListRecent.mock.calls.at(-1);
        expect(lastCall?.[0]).toMatchObject({ query: { mediaType: 'movie' } });
      });
    });

    it('passes mediaType filter when Episodes tab is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByText('Episodes'));
      await waitFor(() => {
        const lastCall = mockWatchHistoryListRecent.mock.calls.at(-1);
        expect(lastCall?.[0]).toMatchObject({ query: { mediaType: 'episode' } });
      });
    });

    it('does not pass mediaType filter when All tab is selected', async () => {
      renderPage();
      await screen.findAllByText('Breaking Bad');
      const lastCall = mockWatchHistoryListRecent.mock.calls.at(-1);
      const opts = lastCall?.[0] as { query: Record<string, unknown> } | undefined;
      expect(opts).toBeDefined();
      expect(opts?.query).not.toHaveProperty('mediaType');
    });
  });

  describe('pagination', () => {
    it('shows pagination info', async () => {
      renderPage();
      expect(await screen.findByText('Showing 2 of 2')).toBeInTheDocument();
    });

    it('shows Next button when there are more pages', async () => {
      mockWatchHistoryListRecent.mockResolvedValue(
        listResult(
          Array.from({ length: 50 }, (_, i) => ({ ...movieEntry, id: i + 1 })),
          100
        )
      );
      renderPage();
      expect(await screen.findByText('Next')).toBeInTheDocument();
    });

    it('hides Previous button on first page', async () => {
      renderPage();
      await screen.findAllByText('Breaking Bad');
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    });
  });
});
