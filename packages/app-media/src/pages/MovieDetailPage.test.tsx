import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { moviesGetMock, watchHistoryListMock, comparisonsGetStalenessMock } = vi.hoisted(() => ({
  moviesGetMock: vi.fn(),
  watchHistoryListMock: vi.fn(),
  comparisonsGetStalenessMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  moviesGet: (...args: unknown[]) => moviesGetMock(...args),
  watchHistoryList: (...args: unknown[]) => watchHistoryListMock(...args),
  comparisonsGetStaleness: (...args: unknown[]) => comparisonsGetStalenessMock(...args),
}));

// Mock sub-components that need their own data context.
vi.mock('../components/WatchlistToggle', () => ({
  WatchlistToggle: () => <button>Watchlist</button>,
}));
vi.mock('../components/MarkAsWatchedButton', () => ({
  MarkAsWatchedButton: () => <button>Mark Watched</button>,
}));
vi.mock('../components/ComparisonScores', () => ({
  ComparisonScores: () => <div data-testid="comparison-scores" />,
}));
vi.mock('../components/ArrStatusBadge', () => ({
  ArrStatusBadge: () => <span>Arr Status</span>,
}));
vi.mock('../components/MovieActionButtons', () => ({
  MovieActionButtons: () => null,
}));
vi.mock('../components/FreshnessBadge', () => ({
  FreshnessBadge: () => null,
}));
vi.mock('../components/ExcludedDimensions', () => ({
  ExcludedDimensions: () => null,
}));
vi.mock('../components/LeavingBadge', () => ({
  LeavingBadge: ({ rotationExpiresAt }: { rotationExpiresAt: string }) => (
    <span data-testid="leaving-badge">{rotationExpiresAt}</span>
  ),
}));

import { MovieDetailPage } from './MovieDetailPage';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderAtRoute(path: string) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/media/movies/:id" element={<MovieDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper }
  );
}

const baseMovie = {
  id: 1,
  tmdbId: 278,
  imdbId: 'tt0111161',
  title: 'The Shawshank Redemption',
  originalTitle: 'The Shawshank Redemption',
  overview: 'Framed in the 1940s for a double murder.',
  tagline: 'Fear can hold you prisoner. Hope can set you free.',
  releaseDate: '1994-09-23',
  runtime: 142,
  status: 'Released',
  originalLanguage: 'en',
  budget: 25000000,
  revenue: 58300000,
  posterPath: '/poster.jpg',
  posterUrl: '/media/images/movie/278/poster.jpg',
  backdropPath: '/backdrop.jpg',
  backdropUrl: '/media/images/movie/278/backdrop.jpg',
  logoPath: null,
  logoUrl: null,
  posterOverridePath: null,
  voteAverage: 8.7,
  voteCount: 24000,
  genres: ['Drama', 'Crime'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function mockMovie(overrides: Record<string, unknown> = {}) {
  moviesGetMock.mockResolvedValue(ok({ data: { ...baseMovie, ...overrides } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMovie();
  watchHistoryListMock.mockResolvedValue(ok({ data: [] }));
  comparisonsGetStalenessMock.mockResolvedValue(ok({ data: { staleness: 1.0 } }));
});

describe('MovieDetailPage', () => {
  describe('hero with backdrop', () => {
    it('renders backdrop image when backdropUrl is present', async () => {
      const { container } = renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      const backdrop = container.querySelector('img[src="/media/images/movie/278/backdrop.jpg"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('renders poster image', async () => {
      renderAtRoute('/media/movies/1');
      expect(await screen.findByAltText('The Shawshank Redemption poster')).toBeInTheDocument();
    });

    it('renders title in h1', async () => {
      renderAtRoute('/media/movies/1');
      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('The Shawshank Redemption');
    });

    it('renders tagline', async () => {
      renderAtRoute('/media/movies/1');
      expect(
        await screen.findByText('Fear can hold you prisoner. Hope can set you free.')
      ).toBeInTheDocument();
    });

    it('renders year and runtime in hero subtitle', async () => {
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('1994')).toBeInTheDocument();
      // Runtime appears in both hero and metadata grid
      expect(screen.getAllByText('2h 22m')).toHaveLength(2);
    });
  });

  describe('fallback gradient without backdrop', () => {
    it('does not render backdrop img when backdropUrl is null', async () => {
      mockMovie({ backdropUrl: null, backdropPath: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      const imgs = screen.getAllByRole('img');
      expect(imgs).toHaveLength(1); // just the poster
      expect(imgs[0]).toHaveAttribute('alt', 'The Shawshank Redemption poster');
    });

    it('still renders the gradient overlay div', async () => {
      mockMovie({ backdropUrl: null });
      const { container } = renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      const gradient = container.querySelector('.bg-gradient-to-t');
      expect(gradient).toBeInTheDocument();
    });
  });

  describe('poster fallback chain', () => {
    it('renders poster when posterUrl is present', async () => {
      renderAtRoute('/media/movies/1');
      const poster = await screen.findByAltText('The Shawshank Redemption poster');
      expect(poster).toHaveAttribute('src', '/media/images/movie/278/poster.jpg');
    });

    it('renders a placeholder div when posterUrl is null (no img element)', async () => {
      mockMovie({ posterUrl: null });
      const { container } = renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      // Component renders a <div> placeholder instead of <img> when posterUrl is null
      expect(screen.queryByAltText('The Shawshank Redemption poster')).not.toBeInTheDocument();
      const placeholder = container.querySelector('div.rounded-lg.bg-muted.shadow-lg');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('runtime formatting', () => {
    it('formats runtime as Xh Ym', async () => {
      renderAtRoute('/media/movies/1');
      // Runtime appears in both hero subtitle and metadata grid
      expect((await screen.findAllByText('2h 22m')).length).toBeGreaterThanOrEqual(1);
    });

    it('hides runtime when null', async () => {
      mockMovie({ runtime: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText(/\d+h \d+m/)).not.toBeInTheDocument();
    });
  });

  describe('hidden fields when null/zero', () => {
    it('hides budget when zero', async () => {
      mockMovie({ budget: 0 });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    });

    it('hides revenue when null', async () => {
      mockMovie({ revenue: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('hides tagline when null', async () => {
      mockMovie({ tagline: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Fear can hold you prisoner')).not.toBeInTheDocument();
    });
  });

  describe('language display', () => {
    it('shows full language name instead of ISO code', async () => {
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('English')).toBeInTheDocument();
      expect(screen.queryByText('EN')).not.toBeInTheDocument();
    });

    it('shows Japanese for ja', async () => {
      mockMovie({ originalLanguage: 'ja' });
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('Japanese')).toBeInTheDocument();
    });
  });

  describe('404 handling', () => {
    it('shows not found message for 404 error', async () => {
      moviesGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'not found' },
        response: new Response(null, { status: 404 }),
      });
      renderAtRoute('/media/movies/999');
      expect(await screen.findByText('Movie not found')).toBeInTheDocument();
      expect(screen.getByText("This movie doesn't exist in your library.")).toBeInTheDocument();
    });

    it('shows generic error for other errors', async () => {
      moviesGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'pillar unavailable' },
        response: new Response(null, { status: 500 }),
      });
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('Error')).toBeInTheDocument();
      expect(screen.getByText('pillar unavailable')).toBeInTheDocument();
    });

    it('shows back to library link on error', async () => {
      moviesGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'not found' },
        response: new Response(null, { status: 404 }),
      });
      renderAtRoute('/media/movies/999');
      expect(await screen.findByText('Back to library')).toHaveAttribute('href', '/media');
    });
  });

  describe('watch history', () => {
    it("shows 'Not watched yet' when no watch history", async () => {
      watchHistoryListMock.mockResolvedValue(ok({ data: [] }));
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('Not watched yet')).toBeInTheDocument();
    });

    it('shows watch dates chronologically', async () => {
      watchHistoryListMock.mockResolvedValue(
        ok({
          data: [
            {
              id: 2,
              mediaType: 'movie',
              mediaId: 1,
              watchedAt: '2026-03-15T00:00:00Z',
              completed: 1,
            },
            {
              id: 1,
              mediaType: 'movie',
              mediaId: 1,
              watchedAt: '2025-12-25T00:00:00Z',
              completed: 1,
            },
          ],
        })
      );
      const { container } = renderAtRoute('/media/movies/1');
      await screen.findByText('Watch History');
      // Get list items from the watch history ul specifically
      const watchHistoryList = container.querySelector('ul');
      expect(watchHistoryList).toBeInTheDocument();
      const items = watchHistoryList!.querySelectorAll('li');
      expect(items).toHaveLength(2);
      // Should be chronological: Dec 2025 first, Mar 2026 second
      expect(items[0]!.textContent).toContain('December');
      expect(items[1]!.textContent).toContain('March');
    });

    it('renders Watch History heading', async () => {
      renderAtRoute('/media/movies/1');
      expect(await screen.findByText('Watch History')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton when loading', async () => {
      let resolveMovie: ((value: unknown) => void) | undefined;
      moviesGetMock.mockReturnValue(
        new Promise((resolve) => {
          resolveMovie = resolve;
        })
      );
      const { container } = renderAtRoute('/media/movies/1');
      // Skeleton renders multiple placeholder elements while the query is pending.
      expect(
        container.querySelectorAll("[class*='animate-pulse'], [data-slot='skeleton']").length
      ).toBeGreaterThan(0);
      resolveMovie?.(ok({ data: baseMovie }));
    });
  });

  describe('leaving badge in hero row', () => {
    it('renders LeavingBadge when rotationStatus is leaving and rotationExpiresAt is set', async () => {
      mockMovie({ rotationStatus: 'leaving', rotationExpiresAt: '2026-05-01T00:00:00Z' });
      renderAtRoute('/media/movies/1');
      expect(await screen.findByTestId('leaving-badge')).toBeInTheDocument();
    });

    it('does not render LeavingBadge when rotationStatus is not leaving', async () => {
      mockMovie({ rotationStatus: 'protected', rotationExpiresAt: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByTestId('leaving-badge')).not.toBeInTheDocument();
    });

    it('does not render LeavingBadge when rotationStatus is leaving but rotationExpiresAt is null', async () => {
      mockMovie({ rotationStatus: 'leaving', rotationExpiresAt: null });
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByTestId('leaving-badge')).not.toBeInTheDocument();
    });

    it('does not render LeavingBadge when rotationStatus is absent', async () => {
      renderAtRoute('/media/movies/1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByTestId('leaving-badge')).not.toBeInTheDocument();
    });
  });
});
