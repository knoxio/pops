import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock trpc hooks
const mockMovieQuery = vi.fn();
const mockWatchHistoryQuery = vi.fn();
const mockGetStalenessQuery = vi.fn();
const mockGetPendingDebriefsQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      movies: {
        get: { useQuery: (...args: unknown[]) => mockMovieQuery(...args) },
      },
      watchHistory: {
        list: { useQuery: (...args: unknown[]) => mockWatchHistoryQuery(...args) },
      },
      comparisons: {
        getStaleness: { useQuery: (...args: unknown[]) => mockGetStalenessQuery(...args) },
        getPendingDebriefs: {
          useQuery: (...args: unknown[]) => mockGetPendingDebriefsQuery(...args),
        },
      },
    },
  },
}));

// Mock sub-components that need their own tRPC context
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
vi.mock('../components/RequestMovieButton', () => ({
  RequestMovieButton: () => null,
}));
vi.mock('../components/FreshnessBadge', () => ({
  FreshnessBadge: () => null,
}));
vi.mock('../components/ExcludedDimensions', () => ({
  ExcludedDimensions: () => null,
}));

import { MovieDetailPage } from './MovieDetailPage';

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/media/movies/:id" element={<MovieDetailPage />} />
      </Routes>
    </MemoryRouter>
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

beforeEach(() => {
  mockMovieQuery.mockReturnValue({
    data: { data: baseMovie },
    isLoading: false,
    error: null,
  });
  mockWatchHistoryQuery.mockReturnValue({
    data: { data: [] },
  });
  mockGetStalenessQuery.mockReturnValue({
    data: { data: { staleness: 1.0 } },
  });
  mockGetPendingDebriefsQuery.mockReturnValue({
    data: { data: [] },
  });
});

describe('MovieDetailPage', () => {
  describe('hero with backdrop', () => {
    it('renders backdrop image when backdropUrl is present', () => {
      const { container } = renderAtRoute('/media/movies/1');
      const backdrop = container.querySelector('img[src="/media/images/movie/278/backdrop.jpg"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('renders poster image', () => {
      renderAtRoute('/media/movies/1');
      expect(screen.getByAltText('The Shawshank Redemption poster')).toBeInTheDocument();
    });

    it('renders title in h1', () => {
      renderAtRoute('/media/movies/1');
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('The Shawshank Redemption');
    });

    it('renders tagline', () => {
      renderAtRoute('/media/movies/1');
      expect(
        screen.getByText('Fear can hold you prisoner. Hope can set you free.')
      ).toBeInTheDocument();
    });

    it('renders year and runtime in hero subtitle', () => {
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('1994')).toBeInTheDocument();
      // Runtime appears in both hero and metadata grid
      expect(screen.getAllByText('2h 22m')).toHaveLength(2);
    });
  });

  describe('fallback gradient without backdrop', () => {
    it('does not render backdrop img when backdropUrl is null', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, backdropUrl: null, backdropPath: null } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      // Only poster img should exist, no backdrop
      const imgs = screen.getAllByRole('img');
      expect(imgs).toHaveLength(1); // just the poster
      expect(imgs[0]).toHaveAttribute('alt', 'The Shawshank Redemption poster');
    });

    it('still renders the gradient overlay div', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, backdropUrl: null } },
        isLoading: false,
        error: null,
      });
      const { container } = renderAtRoute('/media/movies/1');
      const gradient = container.querySelector('.bg-gradient-to-t');
      expect(gradient).toBeInTheDocument();
    });
  });

  describe('poster fallback chain', () => {
    it('renders poster when posterUrl is present', () => {
      renderAtRoute('/media/movies/1');
      const poster = screen.getByAltText('The Shawshank Redemption poster');
      expect(poster).toHaveAttribute('src', '/media/images/movie/278/poster.jpg');
    });

    it('renders a placeholder div when posterUrl is null (no img element)', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, posterUrl: null } },
        isLoading: false,
        error: null,
      });
      const { container } = renderAtRoute('/media/movies/1');
      // Component renders a <div> placeholder instead of <img> when posterUrl is null
      expect(screen.queryByAltText('The Shawshank Redemption poster')).not.toBeInTheDocument();
      const placeholder = container.querySelector('div.rounded-lg.bg-muted.shadow-lg');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('runtime formatting', () => {
    it('formats runtime as Xh Ym', () => {
      renderAtRoute('/media/movies/1');
      // Runtime appears in both hero subtitle and metadata grid
      expect(screen.getAllByText('2h 22m').length).toBeGreaterThanOrEqual(1);
    });

    it('hides runtime when null', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, runtime: null } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      expect(screen.queryByText(/\d+h \d+m/)).not.toBeInTheDocument();
    });
  });

  describe('hidden fields when null/zero', () => {
    it('hides budget when zero', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, budget: 0 } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    });

    it('hides revenue when null', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, revenue: null } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('hides tagline when null', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, tagline: null } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      expect(screen.queryByText('Fear can hold you prisoner')).not.toBeInTheDocument();
    });
  });

  describe('language display', () => {
    it('shows full language name instead of ISO code', () => {
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.queryByText('EN')).not.toBeInTheDocument();
    });

    it('shows Japanese for ja', () => {
      mockMovieQuery.mockReturnValue({
        data: { data: { ...baseMovie, originalLanguage: 'ja' } },
        isLoading: false,
        error: null,
      });
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('Japanese')).toBeInTheDocument();
    });
  });

  describe('404 handling', () => {
    it('shows not found message for NOT_FOUND error', () => {
      mockMovieQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: 'NOT_FOUND' }, message: 'Not found' },
      });
      renderAtRoute('/media/movies/999');
      expect(screen.getByText('Movie not found')).toBeInTheDocument();
      expect(screen.getByText("This movie doesn't exist in your library.")).toBeInTheDocument();
    });

    it('shows generic error for other errors', () => {
      mockMovieQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: 'INTERNAL_SERVER_ERROR' }, message: 'Something broke' },
      });
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something broke')).toBeInTheDocument();
    });

    it('shows back to library link on error', () => {
      mockMovieQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: 'NOT_FOUND' }, message: 'Not found' },
      });
      renderAtRoute('/media/movies/999');
      expect(screen.getByText('Back to library')).toHaveAttribute('href', '/media');
    });
  });

  describe('watch history', () => {
    it("shows 'Not watched yet' when no watch history", () => {
      mockWatchHistoryQuery.mockReturnValue({ data: { data: [] } });
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('Not watched yet')).toBeInTheDocument();
    });

    it('shows watch dates chronologically', () => {
      mockWatchHistoryQuery.mockReturnValue({
        data: {
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
        },
      });
      const { container } = renderAtRoute('/media/movies/1');
      // Get list items from the watch history ul specifically
      const watchHistoryList = container.querySelector('ul');
      expect(watchHistoryList).toBeInTheDocument();
      const items = watchHistoryList!.querySelectorAll('li');
      expect(items).toHaveLength(2);
      // Should be chronological: Dec 2025 first, Mar 2026 second
      expect(items[0]!.textContent).toContain('December');
      expect(items[1]!.textContent).toContain('March');
    });

    it('renders Watch History heading', () => {
      renderAtRoute('/media/movies/1');
      expect(screen.getByText('Watch History')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      mockMovieQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });
      const { container } = renderAtRoute('/media/movies/1');
      // Skeleton renders multiple placeholder elements
      expect(
        container.querySelectorAll("[class*='animate-pulse'], [data-slot='skeleton']").length
      ).toBeGreaterThan(0);
    });
  });

  describe('debrief button', () => {
    it('shows debrief button when movie has a pending debrief', () => {
      mockGetPendingDebriefsQuery.mockReturnValue({
        data: {
          data: [
            {
              sessionId: 42,
              movieId: 1,
              title: 'The Shawshank Redemption',
              posterUrl: null,
              status: 'pending',
              createdAt: '2026-04-01T00:00:00Z',
              pendingDimensionCount: 3,
            },
          ],
        },
      });
      renderAtRoute('/media/movies/1');
      const button = screen.getByText('Debrief this movie');
      expect(button).toBeInTheDocument();
      expect(button.closest('a')).toHaveAttribute('href', '/media/debrief/1');
    });

    it('hides debrief button when no pending debrief for this movie', () => {
      mockGetPendingDebriefsQuery.mockReturnValue({
        data: { data: [] },
      });
      renderAtRoute('/media/movies/1');
      expect(screen.queryByText('Debrief this movie')).not.toBeInTheDocument();
    });
  });
});
