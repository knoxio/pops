import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { libraryListMock, libraryGenresMock } = vi.hoisted(() => ({
  libraryListMock: vi.fn(),
  libraryGenresMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  libraryList: (...args: unknown[]) => libraryListMock(...args),
  libraryGenres: (...args: unknown[]) => libraryGenresMock(...args),
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

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(initialPath = '/media', queryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/media" element={<LibraryPage />} />
        <Route path="/media/search" element={<div data-testid="search-page" />} />
      </Routes>
    </MemoryRouter>,
    { wrapper }
  );
}

function listEnvelope(
  items: unknown[],
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  }
) {
  return ok({ data: items, pagination });
}

const emptyEnvelope = listEnvelope([], {
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 0,
  hasMore: false,
});

const populatedEnvelope = listEnvelope(
  [
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
  { page: 1, pageSize: 24, total: 2, totalPages: 1, hasMore: false }
);

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryGenresMock.mockResolvedValue(ok({ data: ['Drama', 'Sci-Fi'] }));
    libraryListMock.mockResolvedValue(emptyEnvelope);
  });

  describe('Loading state', () => {
    it('renders skeleton cards while loading', () => {
      libraryListMock.mockReturnValue(new Promise(() => {}));
      renderPage();

      const grid = screen.getByTestId('media-grid');
      const skeletons = grid.querySelectorAll('.space-y-2');
      expect(skeletons.length).toBe(24);
    });

    it('renders skeleton count matching pageSize param', () => {
      libraryListMock.mockReturnValue(new Promise(() => {}));
      renderPage('/media?pageSize=48');

      const grid = screen.getByTestId('media-grid');
      const skeletons = grid.querySelectorAll('.space-y-2');
      expect(skeletons.length).toBe(48);
    });
  });

  describe('Error state', () => {
    it('renders error message with retry button', async () => {
      libraryListMock.mockRejectedValue(new Error('Network error'));
      renderPage();

      expect(
        await screen.findByText('Something went wrong loading your library.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('calls the library API again when Retry is clicked', async () => {
      libraryListMock.mockRejectedValue(new Error('Network error'));
      renderPage();

      await screen.findByRole('button', { name: 'Retry' });
      libraryListMock.mockClear();
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(libraryListMock).toHaveBeenCalled());
    });

    it('does not expose technical error details', async () => {
      libraryListMock.mockRejectedValue(
        new Error('TRPC_INTERNAL_ERROR: connection refused at postgres:5432')
      );
      renderPage();

      expect(
        await screen.findByText('Something went wrong loading your library.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/TRPC_INTERNAL_ERROR/)).not.toBeInTheDocument();
      expect(screen.queryByText(/postgres/)).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty library message when no items exist', async () => {
      libraryListMock.mockResolvedValue(emptyEnvelope);
      renderPage();

      expect(
        await screen.findByText(
          'Your library is empty. Search for movies and shows to get started.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Search for media')).toBeInTheDocument();
    });

    it('links to search page from empty state', async () => {
      libraryListMock.mockResolvedValue(emptyEnvelope);
      renderPage();

      const link = await screen.findByText('Search for media');
      expect(link.closest('a')).toHaveAttribute('href', '/media/search');
    });
  });

  describe('Empty search state', () => {
    it("shows 'No results for' message with the search query", async () => {
      libraryListMock.mockResolvedValue(emptyEnvelope);
      renderPage('/media?q=xyznonexistent');

      expect(await screen.findByText(/No results for/)).toBeInTheDocument();
      expect(screen.getByText(/xyznonexistent/)).toBeInTheDocument();
    });

    it('shows Clear search button when search has no results', async () => {
      libraryListMock.mockResolvedValue(emptyEnvelope);
      renderPage('/media?q=xyznonexistent');

      expect(await screen.findByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    });

    it('shows generic filter message when no search query', async () => {
      libraryListMock.mockResolvedValue(emptyEnvelope);
      renderPage('/media?type=movie&genre=Horror');

      expect(await screen.findByText('No results match your filters.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    });
  });

  describe('Populated state', () => {
    it('renders media cards when data is loaded', async () => {
      libraryListMock.mockResolvedValue(populatedEnvelope);
      renderPage();

      expect(await screen.findByText('Inception')).toBeInTheDocument();
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });
  });
});
