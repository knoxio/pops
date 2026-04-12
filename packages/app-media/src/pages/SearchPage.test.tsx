import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockMovieSearch,
  mockTvSearch,
  mockLibraryMovies,
  mockLibraryTv,
  mockAddMovieMutation,
  mockAddTvMutation,
  mockMovieRefetch,
  mockTvRefetch,
} = vi.hoisted(() => ({
  mockMovieSearch: vi.fn(),
  mockTvSearch: vi.fn(),
  mockLibraryMovies: vi.fn(),
  mockLibraryTv: vi.fn(),
  mockAddMovieMutation: vi.fn(),
  mockAddTvMutation: vi.fn(),
  mockMovieRefetch: vi.fn(),
  mockTvRefetch: vi.fn(),
}));

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      search: {
        movies: { useQuery: (...args: unknown[]) => mockMovieSearch(...args) },
        tvShows: { useQuery: (...args: unknown[]) => mockTvSearch(...args) },
      },
      movies: {
        list: { useQuery: (...args: unknown[]) => mockLibraryMovies(...args) },
      },
      tvShows: {
        list: { useQuery: (...args: unknown[]) => mockLibraryTv(...args) },
      },
      library: {
        addMovie: { useMutation: () => ({ mutate: mockAddMovieMutation }) },
        addTvShow: { useMutation: () => ({ mutate: mockAddTvMutation }) },
      },
    },
  },
}));

// Capture props passed to SearchResultCard for assertion
let lastMovieCardProps: Record<string, unknown>[] = [];
let lastTvCardProps: Record<string, unknown>[] = [];

vi.mock('../components/SearchResultCard', () => ({
  SearchResultCard: (props: Record<string, unknown>) => {
    if (props.type === 'movie') lastMovieCardProps.push(props);
    else lastTvCardProps.push(props);
    return (
      <div data-testid={`card-${props.type as string}-${props.title as string}`}>
        <span>{props.title as string}</span>
        {Boolean(props.inLibrary) && <span data-testid="in-library-badge">In Library</span>}
        {!props.posterUrl && <span data-testid="no-poster" />}
        {props.overview != null && <p className="line-clamp-2">{props.overview as string}</p>}
      </div>
    );
  },
  buildPosterUrl: (path: string | null, type: string) => {
    if (!path) return null;
    if (type === 'movie' && path.startsWith('/')) return `https://image.tmdb.org/t/p/w342${path}`;
    return path;
  },
}));

vi.mock('../components/RequestMovieButton', () => ({
  RequestMovieButton: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Test data ──────────────────────────────────────────────────────────────

const MOVIE_RESULTS = [
  {
    tmdbId: 101,
    title: 'Inception',
    overview: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
    releaseDate: '2010-07-16',
    posterPath: '/inception.jpg',
    voteAverage: 8.8,
    genreIds: [28, 878],
  },
  {
    tmdbId: 102,
    title: 'Interstellar',
    overview: 'A team of explorers travel through a wormhole in space.',
    releaseDate: '2014-11-07',
    posterPath: null,
    voteAverage: 8.6,
    genreIds: [18, 878],
  },
];

const TV_RESULTS = [
  {
    tvdbId: 201,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher turned meth cook.',
    firstAirDate: '2008-01-20',
    posterPath: 'https://cdn.tvdb.com/bb.jpg',
    genres: ['Drama'],
    year: '2008',
  },
  {
    tvdbId: 202,
    name: 'Severance',
    overview: null,
    firstAirDate: '2022-02-18',
    posterPath: null,
    genres: [],
    year: '2022',
  },
];

const LIBRARY_MOVIES = [{ id: 1, tmdbId: 101 }]; // Inception is in library
const LIBRARY_TV = [{ id: 2, tvdbId: 201 }]; // Breaking Bad is in library

// ── Helpers ────────────────────────────────────────────────────────────────

function setupMovieResults(overrides = {}) {
  mockMovieSearch.mockReturnValue({
    data: { results: MOVIE_RESULTS },
    isLoading: false,
    error: null,
    refetch: mockMovieRefetch,
    ...overrides,
  });
}

function setupTvResults(overrides = {}) {
  mockTvSearch.mockReturnValue({
    data: { results: TV_RESULTS },
    isLoading: false,
    error: null,
    refetch: mockTvRefetch,
    ...overrides,
  });
}

function setupLibrary() {
  mockLibraryMovies.mockReturnValue({ data: { data: LIBRARY_MOVIES } });
  mockLibraryTv.mockReturnValue({ data: { data: LIBRARY_TV } });
}

function setupEmptyLibrary() {
  mockLibraryMovies.mockReturnValue({ data: { data: [] } });
  mockLibraryTv.mockReturnValue({ data: { data: [] } });
}

function renderPage(path = '/media/search?q=inception') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/media/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

import { SearchPage } from './SearchPage';

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  lastMovieCardProps = [];
  lastTvCardProps = [];
  setupMovieResults();
  setupTvResults();
  setupLibrary();
});

describe('SearchPage — both sections render independently', () => {
  it("shows movie results and TV results simultaneously in 'Both' mode", () => {
    renderPage();

    expect(screen.getByTestId('card-movie-Inception')).toBeInTheDocument();
    expect(screen.getByTestId('card-tv-Breaking Bad')).toBeInTheDocument();
  });

  it('shows only movie results when mode is Movies', async () => {
    const user = userEvent.setup();
    renderPage('/media/search?q=test');
    await user.click(screen.getByRole('tab', { name: 'Movies' }));

    expect(screen.queryByTestId('card-tv-Breaking Bad')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-movie-Inception')).toBeInTheDocument();
  });

  it('shows only TV results when mode is TV Shows', async () => {
    const user = userEvent.setup();
    renderPage('/media/search?q=test');
    await user.click(screen.getByRole('tab', { name: 'TV Shows' }));

    expect(screen.queryByTestId('card-movie-Inception')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-tv-Breaking Bad')).toBeInTheDocument();
  });

  it('movie section shows skeleton while loading, TV section shows results', () => {
    setupMovieResults({ data: null, isLoading: true });
    setupTvResults();
    renderPage();

    // TV results visible
    expect(screen.getByTestId('card-tv-Breaking Bad')).toBeInTheDocument();
    // Movie skeleton visible (skeleton divs in movie section)
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    // No movie cards
    expect(screen.queryByTestId('card-movie-Inception')).not.toBeInTheDocument();
  });

  it('TV section shows skeleton while loading, movie section shows results', () => {
    setupTvResults({ data: null, isLoading: true });
    setupMovieResults();
    renderPage();

    expect(screen.getByTestId('card-movie-Inception')).toBeInTheDocument();
    expect(screen.queryByTestId('card-tv-Breaking Bad')).not.toBeInTheDocument();
  });
});

describe('SearchPage — per-section error states', () => {
  it('shows movie error with Retry button when movie search fails', () => {
    setupMovieResults({ data: null, isLoading: false, error: { message: 'TMDB error' } });
    renderPage();

    expect(screen.getByText('Movie search failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls movieSearch.refetch when movie Retry is clicked', () => {
    setupMovieResults({ data: null, isLoading: false, error: { message: 'Error' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockMovieRefetch).toHaveBeenCalled();
  });

  it('shows TV error with Retry button when TV search fails', () => {
    setupTvResults({ data: null, isLoading: false, error: { message: 'TVDB error' } });
    renderPage();

    expect(screen.getByText('TV search failed')).toBeInTheDocument();
  });

  it('calls tvSearch.refetch when TV Retry is clicked', () => {
    setupTvResults({ data: null, isLoading: false, error: { message: 'Error' } });
    renderPage();

    const retryButtons = screen.getAllByRole('button', { name: 'Retry' });
    fireEvent.click(retryButtons[0]!);
    expect(mockTvRefetch).toHaveBeenCalled();
  });

  it('TV section shows results independently when movie section has error', () => {
    setupMovieResults({ data: null, isLoading: false, error: { message: 'Error' } });
    setupTvResults();
    renderPage();

    expect(screen.getByText('Movie search failed')).toBeInTheDocument();
    expect(screen.getByTestId('card-tv-Breaking Bad')).toBeInTheDocument();
  });
});

describe('SearchPage — no results message', () => {
  it('shows no results message when both sections return empty', () => {
    setupMovieResults({ data: { results: [] } });
    setupTvResults({ data: { results: [] } });
    renderPage();

    expect(screen.getByText(/No results found for/)).toBeInTheDocument();
    expect(screen.getByText(/inception/i)).toBeInTheDocument();
  });

  it('does not show no-results message when results are present', () => {
    renderPage();
    expect(screen.queryByText(/No results found for/)).not.toBeInTheDocument();
  });

  it('shows empty prompt when no query entered', () => {
    renderPage('/media/search');
    expect(screen.getByText(/Start typing to search/)).toBeInTheDocument();
  });
});

describe('SearchPage — In Library badge', () => {
  it('passes inLibrary=true for movies already in library (by tmdbId)', () => {
    renderPage();

    const inceptionCard = lastMovieCardProps.find((p) => p.title === 'Inception');
    expect(inceptionCard?.inLibrary).toBe(true);
  });

  it('passes inLibrary=false for movies not in library', () => {
    renderPage();

    const interstellarCard = lastMovieCardProps.find((p) => p.title === 'Interstellar');
    expect(interstellarCard?.inLibrary).toBe(false);
  });

  it('passes inLibrary=true for TV shows already in library (by tvdbId)', () => {
    renderPage();

    const bbCard = lastTvCardProps.find((p) => p.title === 'Breaking Bad');
    expect(bbCard?.inLibrary).toBe(true);
  });

  it('passes inLibrary=false for TV shows not in library', () => {
    renderPage();

    const severanceCard = lastTvCardProps.find((p) => p.title === 'Severance');
    expect(severanceCard?.inLibrary).toBe(false);
  });

  it('all items show inLibrary=false when library is empty', () => {
    setupEmptyLibrary();
    renderPage();

    expect(lastMovieCardProps.every((p) => p.inLibrary === false)).toBe(true);
    expect(lastTvCardProps.every((p) => p.inLibrary === false)).toBe(true);
  });
});

describe('SearchPage — poster fallback (via card props)', () => {
  it('passes null posterUrl when posterPath is null (movie)', () => {
    renderPage();

    const interstellarCard = lastMovieCardProps.find((p) => p.title === 'Interstellar');
    expect(interstellarCard?.posterUrl).toBeNull();
  });

  it('passes constructed posterUrl for TMDB relative paths', () => {
    renderPage();

    const inceptionCard = lastMovieCardProps.find((p) => p.title === 'Inception');
    expect(inceptionCard?.posterUrl).toBe('https://image.tmdb.org/t/p/w342/inception.jpg');
  });

  it('passes null posterUrl when TV show has no poster', () => {
    renderPage();

    const severanceCard = lastTvCardProps.find((p) => p.title === 'Severance');
    expect(severanceCard?.posterUrl).toBeNull();
  });

  it('passes full TVDB URL when TV show has poster', () => {
    renderPage();

    const bbCard = lastTvCardProps.find((p) => p.title === 'Breaking Bad');
    expect(bbCard?.posterUrl).toBe('https://cdn.tvdb.com/bb.jpg');
  });
});

describe('SearchPage — overview passed to cards', () => {
  it('passes overview text to movie card', () => {
    renderPage();

    const inceptionCard = lastMovieCardProps.find((p) => p.title === 'Inception');
    expect(inceptionCard?.overview).toContain('dream-sharing');
  });

  it('passes null overview for TV shows with no overview', () => {
    renderPage();

    const severanceCard = lastTvCardProps.find((p) => p.title === 'Severance');
    expect(severanceCard?.overview).toBeNull();
  });
});
