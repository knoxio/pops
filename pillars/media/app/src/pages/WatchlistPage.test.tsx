import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  watchlistListMock,
  moviesListMock,
  tvShowsListMock,
  watchlistRemoveMock,
  watchlistReorderMock,
  watchlistUpdateMock,
  plexGetActiveSyncJobsMock,
  plexGetSyncJobStatusMock,
  plexStartSyncJobMock,
} = vi.hoisted(() => ({
  watchlistListMock: vi.fn(),
  moviesListMock: vi.fn(),
  tvShowsListMock: vi.fn(),
  watchlistRemoveMock: vi.fn(),
  watchlistReorderMock: vi.fn(),
  watchlistUpdateMock: vi.fn(),
  plexGetActiveSyncJobsMock: vi.fn(),
  plexGetSyncJobStatusMock: vi.fn(),
  plexStartSyncJobMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  watchlistList: (...args: unknown[]) => watchlistListMock(...args),
  moviesList: (...args: unknown[]) => moviesListMock(...args),
  tvShowsList: (...args: unknown[]) => tvShowsListMock(...args),
  watchlistRemove: (...args: unknown[]) => watchlistRemoveMock(...args),
  watchlistReorder: (...args: unknown[]) => watchlistReorderMock(...args),
  watchlistUpdate: (...args: unknown[]) => watchlistUpdateMock(...args),
  plexGetActiveSyncJobs: (...args: unknown[]) => plexGetActiveSyncJobsMock(...args),
  plexGetSyncJobStatus: (...args: unknown[]) => plexGetSyncJobStatusMock(...args),
  plexStartSyncJob: (...args: unknown[]) => plexStartSyncJobMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/LeavingBadge', () => ({
  LeavingBadge: ({ rotationExpiresAt }: { rotationExpiresAt: string }) => (
    <span data-testid="leaving-badge">{rotationExpiresAt}</span>
  ),
}));

import { WatchlistPage } from './WatchlistPage';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(queryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
    { wrapper }
  );
}

const entry1 = {
  id: 1,
  mediaType: 'movie',
  mediaId: 10,
  priority: 0,
  notes: null,
  addedAt: '2026-03-20T10:00:00Z',
};

const entry2 = {
  id: 2,
  mediaType: 'tv_show',
  mediaId: 20,
  priority: 1,
  notes: 'Great show',
  addedAt: '2026-03-19T10:00:00Z',
};

const entry3 = {
  id: 3,
  mediaType: 'movie',
  mediaId: 30,
  priority: 2,
  notes: null,
  addedAt: '2026-03-18T10:00:00Z',
};

function setupMultipleEntries() {
  watchlistListMock.mockResolvedValue(ok({ data: [entry1, entry2, entry3] }));
  moviesListMock.mockResolvedValue(
    ok({
      data: [
        { id: 10, title: 'The Matrix', releaseDate: '1999-03-31', posterUrl: null },
        { id: 30, title: 'Inception', releaseDate: '2010-07-16', posterUrl: null },
      ],
    })
  );
  tvShowsListMock.mockResolvedValue(
    ok({ data: [{ id: 20, name: 'Breaking Bad', firstAirDate: '2008-01-20', posterUrl: null }] })
  );
}

function setupSingleEntry() {
  watchlistListMock.mockResolvedValue(ok({ data: [entry1] }));
  moviesListMock.mockResolvedValue(
    ok({ data: [{ id: 10, title: 'The Matrix', releaseDate: '1999-03-31', posterUrl: null }] })
  );
  tvShowsListMock.mockResolvedValue(ok({ data: [] }));
}

describe('WatchlistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plexGetActiveSyncJobsMock.mockResolvedValue(ok({ data: [] }));
    plexGetSyncJobStatusMock.mockResolvedValue(ok({ data: undefined }));
    plexStartSyncJobMock.mockResolvedValue(ok({ data: { jobId: 'job-1' } }));
    watchlistListMock.mockResolvedValue(ok({ data: [] }));
    moviesListMock.mockResolvedValue(ok({ data: [] }));
    tvShowsListMock.mockResolvedValue(ok({ data: [] }));
  });

  it('renders watchlist entries with titles', async () => {
    setupMultipleEntries();
    renderPage();

    expect((await screen.findAllByText('The Matrix')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Breaking Bad').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inception').length).toBeGreaterThan(0);
  });

  it('renders grab handle on desktop cards for multiple items', async () => {
    setupMultipleEntries();
    renderPage();

    const handles = await screen.findAllByLabelText(/Drag to reorder/);
    expect(handles.length).toBeGreaterThan(0);
  });

  it('hides reorder controls for single-item list', async () => {
    setupSingleEntry();
    renderPage();

    await screen.findAllByText('The Matrix');
    expect(screen.queryByLabelText(/Move .* up/)).toBeNull();
    expect(screen.queryByLabelText(/Move .* down/)).toBeNull();
    expect(screen.queryByLabelText(/Drag to reorder/)).toBeNull();
  });

  it('renders up/down buttons for mobile with multiple items', async () => {
    setupMultipleEntries();
    renderPage();

    const upButtons = await screen.findAllByLabelText(/Move .* up/);
    const downButtons = screen.getAllByLabelText(/Move .* down/);
    expect(upButtons.length).toBe(3);
    expect(downButtons.length).toBe(3);
  });

  it('disables up button on first item and down button on last item', async () => {
    setupMultipleEntries();
    renderPage();

    const upButtons = await screen.findAllByLabelText(/Move .* up/);
    const downButtons = screen.getAllByLabelText(/Move .* down/);

    expect(upButtons[0]).toBeDisabled();
    expect(downButtons.at(-1)).toBeDisabled();
  });

  it('renders empty state when watchlist is empty', async () => {
    watchlistListMock.mockResolvedValue(ok({ data: [] }));
    moviesListMock.mockResolvedValue(ok({ data: [] }));
    tvShowsListMock.mockResolvedValue(ok({ data: [] }));

    renderPage();

    expect(await screen.findByText(/Your watchlist is empty/)).toBeInTheDocument();
  });

  it('renders priority badges on desktop cards', async () => {
    setupMultipleEntries();
    renderPage();

    expect((await screen.findAllByText('#1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#3').length).toBeGreaterThan(0);
  });

  it('renders priority numbers on mobile list items', async () => {
    setupMultipleEntries();
    renderPage();

    expect((await screen.findAllByText('1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('renders notes text on watchlist items', async () => {
    setupMultipleEntries();
    renderPage();

    expect((await screen.findAllByText('Great show')).length).toBeGreaterThan(0);
  });

  describe('filter tabs', () => {
    it('renders All, Movies, TV Shows filter tabs', async () => {
      setupMultipleEntries();
      renderPage();
      expect(await screen.findByRole('tab', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Movies' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'TV Shows' })).toBeInTheDocument();
    });

    it('All tab is selected by default', async () => {
      setupMultipleEntries();
      renderPage();
      expect(await screen.findByRole('tab', { name: 'All' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('tab', { name: 'Movies' })).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Movies tab calls API with mediaType filter', async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('tab', { name: 'Movies' }));

      await waitFor(() =>
        expect(watchlistListMock).toHaveBeenCalledWith({
          query: expect.objectContaining({ mediaType: 'movie' }),
        })
      );
    });

    it('clicking TV Shows tab calls API with tv_show filter', async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('tab', { name: 'TV Shows' }));

      await waitFor(() =>
        expect(watchlistListMock).toHaveBeenCalledWith({
          query: expect.objectContaining({ mediaType: 'tv_show' }),
        })
      );
    });

    it('clicking All tab removes mediaType filter', async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('tab', { name: 'Movies' }));
      await waitFor(() =>
        expect(watchlistListMock).toHaveBeenCalledWith({
          query: expect.objectContaining({ mediaType: 'movie' }),
        })
      );

      watchlistListMock.mockClear();
      await user.click(screen.getByRole('tab', { name: 'All' }));

      await waitFor(() => expect(watchlistListMock).toHaveBeenCalled());
      const lastCall = watchlistListMock.mock.calls.at(-1)!;
      const lastQuery = (lastCall[0] as { query: Record<string, unknown> }).query;
      expect(lastQuery).not.toHaveProperty('mediaType');
    });

    it('shows filter-specific empty state for movies', async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await screen.findByRole('tab', { name: 'Movies' });
      watchlistListMock.mockResolvedValue(ok({ data: [] }));

      await user.click(screen.getByRole('tab', { name: 'Movies' }));

      expect(await screen.findByText('No movies on your watchlist.')).toBeInTheDocument();
    });

    it('shows filter-specific empty state for TV shows', async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await screen.findByRole('tab', { name: 'TV Shows' });
      watchlistListMock.mockResolvedValue(ok({ data: [] }));

      await user.click(screen.getByRole('tab', { name: 'TV Shows' }));

      expect(await screen.findByText('No TV shows on your watchlist.')).toBeInTheDocument();
    });
  });

  describe('leaving badge', () => {
    it('shows LeavingBadge for a movie with rotationStatus leaving', async () => {
      watchlistListMock.mockResolvedValue(ok({ data: [entry1] }));
      moviesListMock.mockResolvedValue(
        ok({
          data: [
            {
              id: 10,
              title: 'The Matrix',
              releaseDate: '1999-03-31',
              posterUrl: null,
              rotationStatus: 'leaving' as const,
              rotationExpiresAt: '2026-05-01T00:00:00Z',
            },
          ],
        })
      );
      tvShowsListMock.mockResolvedValue(ok({ data: [] }));

      renderPage();

      expect((await screen.findAllByTestId('leaving-badge')).length).toBeGreaterThan(0);
    });

    it('does not show LeavingBadge when rotationStatus is not leaving', async () => {
      watchlistListMock.mockResolvedValue(ok({ data: [entry1] }));
      moviesListMock.mockResolvedValue(
        ok({
          data: [
            {
              id: 10,
              title: 'The Matrix',
              releaseDate: '1999-03-31',
              posterUrl: null,
              rotationStatus: null,
              rotationExpiresAt: null,
            },
          ],
        })
      );
      tvShowsListMock.mockResolvedValue(ok({ data: [] }));

      renderPage();

      await screen.findAllByText('The Matrix');
      expect(screen.queryByTestId('leaving-badge')).not.toBeInTheDocument();
    });
  });
});
