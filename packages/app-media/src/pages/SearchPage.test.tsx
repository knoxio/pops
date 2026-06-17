import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMovieSearch,
  mockTvSearch,
  mockMoviesList,
  mockTvShowsList,
  mockLibraryAddMovie,
  mockLibraryAddTvShow,
  mockWatchlistAdd,
  mockWatchHistoryLog,
  mockMovieRefetch,
  mockTvRefetch,
} = vi.hoisted(() => ({
  mockMovieSearch: vi.fn(),
  mockTvSearch: vi.fn(),
  mockMoviesList: vi.fn(),
  mockTvShowsList: vi.fn(),
  mockLibraryAddMovie: vi.fn(),
  mockLibraryAddTvShow: vi.fn(),
  mockWatchlistAdd: vi.fn(),
  mockWatchHistoryLog: vi.fn(),
  mockMovieRefetch: vi.fn(),
  mockTvRefetch: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (
    _pillarId: string,
    path: readonly string[],
    input: unknown,
    options: unknown
  ) => {
    const key = path.join('.');
    if (key === 'search.movies') return mockMovieSearch(input, options);
    if (key === 'search.tvShows') return mockTvSearch(input, options);
    return { data: undefined, isLoading: false, error: null };
  },
}));

vi.mock('../media-api/index.js', () => ({
  moviesList: (opts: unknown) => mockMoviesList(opts),
  tvShowsList: (opts: unknown) => mockTvShowsList(opts),
  libraryAddMovie: (opts: unknown) => mockLibraryAddMovie(opts),
  libraryAddTvShow: (opts: unknown) => mockLibraryAddTvShow(opts),
  watchlistAdd: (opts: unknown) => mockWatchlistAdd(opts),
  watchHistoryLog: (opts: unknown) => mockWatchHistoryLog(opts),
}));

let lastMovieCardProps: Record<string, unknown>[] = [];
let lastTvCardProps: Record<string, unknown>[] = [];

vi.mock('../components/SearchResultCard', () => ({
  SearchResultCard: (props: Record<string, unknown>) => {
    if (props.type === 'movie') lastMovieCardProps.push(props);
    else lastTvCardProps.push(props);
    return (
      <div
        data-testid={`card-${props.type as string}-${props.title as string}`}
        data-href={props.href as string | undefined}
      >
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

vi.mock('../components/MovieActionButtons', () => ({
  MovieActionButtons: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const LIBRARY_MOVIES = [
  {
    id: 1,
    tmdbId: 101,
    rotationStatus: 'leaving' as const,
    rotationExpiresAt: '2026-05-01T00:00:00Z',
  },
];
const LIBRARY_TV = [{ id: 2, tvdbId: 201 }];

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
  mockMoviesList.mockResolvedValue({ data: { data: LIBRARY_MOVIES } });
  mockTvShowsList.mockResolvedValue({ data: { data: LIBRARY_TV } });
}

function setupEmptyLibrary() {
  mockMoviesList.mockResolvedValue({ data: { data: [] } });
  mockTvShowsList.mockResolvedValue({ data: { data: [] } });
}

function renderPage(path = '/media/search?q=inception') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/media/search', element: children })
        )
      )
    );
  return render(<SearchPage />, { wrapper });
}

import { SearchPage } from './SearchPage';

async function findInLibraryMovieCard(title: string) {
  await screen.findByTestId(`card-movie-${title}`);
  return waitFor(() => {
    const card = lastMovieCardProps.findLast((p) => p.title === title);
    expect(card?.inLibrary).toBe(true);
    return card;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lastMovieCardProps = [];
  lastTvCardProps = [];
  setupMovieResults();
  setupTvResults();
  setupLibrary();
});

describe('SearchPage — both sections render independently', () => {
  it("shows movie results and TV results simultaneously in 'Both' mode", async () => {
    renderPage();

    expect(await screen.findByTestId('card-movie-Inception')).toBeInTheDocument();
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

    expect(screen.getByTestId('card-tv-Breaking Bad')).toBeInTheDocument();
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
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

  it('does not show no-results message when results are present', async () => {
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    expect(screen.queryByText(/No results found for/)).not.toBeInTheDocument();
  });

  it('shows empty prompt when no query entered', () => {
    renderPage('/media/search');
    expect(screen.getByText(/Start typing to search/)).toBeInTheDocument();
  });
});

describe('SearchPage — In Library badge', () => {
  it('passes inLibrary=true for movies already in library (by tmdbId)', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.inLibrary).toBe(true);
  });

  it('passes inLibrary=false for movies not in library', async () => {
    renderPage();
    await findInLibraryMovieCard('Inception');
    const interstellarCard = lastMovieCardProps.findLast((p) => p.title === 'Interstellar');
    expect(interstellarCard?.inLibrary).toBe(false);
  });

  it('passes inLibrary=true for TV shows already in library (by tvdbId)', async () => {
    renderPage();
    await waitFor(() => {
      const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
      expect(bbCard?.inLibrary).toBe(true);
    });
  });

  it('passes inLibrary=false for TV shows not in library', async () => {
    renderPage();
    await waitFor(() => {
      const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
      expect(bbCard?.inLibrary).toBe(true);
    });
    const severanceCard = lastTvCardProps.findLast((p) => p.title === 'Severance');
    expect(severanceCard?.inLibrary).toBe(false);
  });

  it('all items show inLibrary=false when library is empty', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => {
      expect(mockMoviesList).toHaveBeenCalled();
      expect(mockTvShowsList).toHaveBeenCalled();
    });
    expect(lastMovieCardProps.every((p) => p.inLibrary === false)).toBe(true);
    expect(lastTvCardProps.every((p) => p.inLibrary === false)).toBe(true);
  });
});

describe('SearchPage — poster fallback (via card props)', () => {
  it('passes null posterUrl when posterPath is null (movie)', async () => {
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    const interstellarCard = lastMovieCardProps.findLast((p) => p.title === 'Interstellar');
    expect(interstellarCard?.posterUrl).toBeNull();
  });

  it('passes constructed posterUrl for TMDB relative paths', async () => {
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(inceptionCard?.posterUrl).toBe('https://image.tmdb.org/t/p/w342/inception.jpg');
  });

  it('passes null posterUrl when TV show has no poster', async () => {
    renderPage();
    await screen.findByTestId('card-tv-Severance');
    const severanceCard = lastTvCardProps.findLast((p) => p.title === 'Severance');
    expect(severanceCard?.posterUrl).toBeNull();
  });

  it('passes full TVDB URL when TV show has poster', async () => {
    renderPage();
    await screen.findByTestId('card-tv-Breaking Bad');
    const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
    expect(bbCard?.posterUrl).toBe('https://cdn.tvdb.com/bb.jpg');
  });
});

describe('SearchPage — rotation fields passed to in-library movie cards', () => {
  it('passes rotationStatus and rotationExpiresAt for in-library movies', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.rotationStatus).toBe('leaving');
    expect(inceptionCard?.rotationExpiresAt).toBe('2026-05-01T00:00:00Z');
  });

  it('passes undefined rotationStatus and rotationExpiresAt for movies not in library', async () => {
    renderPage();
    await findInLibraryMovieCard('Inception');
    const interstellarCard = lastMovieCardProps.findLast((p) => p.title === 'Interstellar');
    expect(interstellarCard?.rotationStatus).toBeUndefined();
    expect(interstellarCard?.rotationExpiresAt).toBeUndefined();
  });

  it('passes no rotation fields when library is empty', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());
    expect(lastMovieCardProps.every((p) => p.rotationStatus === undefined)).toBe(true);
    expect(lastMovieCardProps.every((p) => p.rotationExpiresAt === undefined)).toBe(true);
  });
});

describe('SearchPage — overview passed to cards', () => {
  it('passes overview text to movie card', async () => {
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(inceptionCard?.overview).toContain('dream-sharing');
  });

  it('passes null overview for TV shows with no overview', async () => {
    renderPage();
    await screen.findByTestId('card-tv-Severance');
    const severanceCard = lastTvCardProps.findLast((p) => p.title === 'Severance');
    expect(severanceCard?.overview).toBeNull();
  });
});

describe('SearchPage — clickable links for in-library items (#1913)', () => {
  it('passes href to in-library movie card pointing to detail page', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.href).toBe('/media/movies/1');
  });

  it('does not pass href to not-in-library movie card', async () => {
    renderPage();
    await findInLibraryMovieCard('Inception');
    const interstellarCard = lastMovieCardProps.findLast((p) => p.title === 'Interstellar');
    expect(interstellarCard?.href).toBeUndefined();
  });

  it('passes href to in-library TV card pointing to detail page', async () => {
    renderPage();
    await waitFor(() => {
      const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
      expect(bbCard?.href).toBe('/media/tv/2');
    });
  });

  it('does not pass href to not-in-library TV card', async () => {
    renderPage();
    await waitFor(() => {
      const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
      expect(bbCard?.inLibrary).toBe(true);
    });
    const severanceCard = lastTvCardProps.findLast((p) => p.title === 'Severance');
    expect(severanceCard?.href).toBeUndefined();
  });

  it('passes mediaId to in-library movie card', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.mediaId).toBe(1);
  });

  it('passes mediaId to in-library TV card', async () => {
    renderPage();
    await waitFor(() => {
      const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
      expect(bbCard?.mediaId).toBe(2);
    });
  });

  it('does not pass mediaId to not-in-library movie card', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(inceptionCard?.mediaId).toBeUndefined();
  });
});

describe('SearchPage — compound actions (#1912)', () => {
  it('passes onAddToWatchlistAndLibrary to not-in-library movie cards', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(typeof inceptionCard?.onAddToWatchlistAndLibrary).toBe('function');
  });

  it('does not pass onAddToWatchlistAndLibrary to in-library movie cards', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.onAddToWatchlistAndLibrary).toBeUndefined();
  });

  it('passes onMarkWatchedAndLibrary to not-in-library movie cards', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(typeof inceptionCard?.onMarkWatchedAndLibrary).toBe('function');
  });

  it('does not pass onMarkWatchedAndLibrary to in-library movie cards', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(inceptionCard?.onMarkWatchedAndLibrary).toBeUndefined();
  });

  it('passes onMarkWatched to in-library movie cards', async () => {
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    expect(typeof inceptionCard?.onMarkWatched).toBe('function');
  });

  it('does not pass onMarkWatched to not-in-library movie cards (no localId)', async () => {
    setupEmptyLibrary();
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());
    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    expect(inceptionCard?.onMarkWatched).toBeUndefined();
  });

  it('calling onAddToWatchlistAndLibrary triggers addMovie then watchlist.add', async () => {
    setupEmptyLibrary();
    mockLibraryAddMovie.mockResolvedValue({
      data: { created: true, data: { id: 99, title: 'Inception' } },
    });
    mockWatchlistAdd.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());

    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    const handler = inceptionCard?.onAddToWatchlistAndLibrary as (() => void) | undefined;
    expect(handler).toBeDefined();

    handler?.();

    await waitFor(() =>
      expect(mockLibraryAddMovie).toHaveBeenCalledWith({ body: { tmdbId: 101 } })
    );
    await waitFor(() =>
      expect(mockWatchlistAdd).toHaveBeenCalledWith({ body: { mediaType: 'movie', mediaId: 99 } })
    );
  });

  it('calling onMarkWatchedAndLibrary triggers addMovie then watchHistory.log', async () => {
    setupEmptyLibrary();
    mockLibraryAddMovie.mockResolvedValue({
      data: { created: true, data: { id: 99, title: 'Inception' } },
    });
    mockWatchHistoryLog.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByTestId('card-movie-Inception');
    await waitFor(() => expect(mockMoviesList).toHaveBeenCalled());

    const inceptionCard = lastMovieCardProps.findLast((p) => p.title === 'Inception');
    const handler = inceptionCard?.onMarkWatchedAndLibrary as (() => void) | undefined;
    expect(handler).toBeDefined();

    handler?.();

    await waitFor(() =>
      expect(mockLibraryAddMovie).toHaveBeenCalledWith({ body: { tmdbId: 101 } })
    );
    await waitFor(() =>
      expect(mockWatchHistoryLog).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 99, completed: 1, source: 'manual' },
      })
    );
  });

  it('calling onMarkWatched for in-library movie triggers watchHistory.log directly', async () => {
    mockWatchHistoryLog.mockResolvedValue({ data: {} });
    renderPage();
    const inceptionCard = await findInLibraryMovieCard('Inception');
    const handler = inceptionCard?.onMarkWatched as (() => void) | undefined;
    expect(handler).toBeDefined();

    handler?.();

    await waitFor(() =>
      expect(mockWatchHistoryLog).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 1, completed: 1, source: 'manual' },
      })
    );
    expect(mockLibraryAddMovie).not.toHaveBeenCalled();
  });

  it('does not pass onAddToWatchlistAndLibrary to TV cards', async () => {
    renderPage();
    await screen.findByTestId('card-tv-Breaking Bad');
    const bbCard = lastTvCardProps.findLast((p) => p.title === 'Breaking Bad');
    expect(bbCard?.onAddToWatchlistAndLibrary).toBeUndefined();
  });
});
