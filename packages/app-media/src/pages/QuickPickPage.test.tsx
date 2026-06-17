import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLibraryQuickPick = vi.fn();

vi.mock('../media-api/index.js', () => ({
  libraryQuickPick: (opts: unknown) => mockLibraryQuickPick(opts),
}));

vi.mock('../components/MediaCard', () => ({
  MediaCard: ({ title, id }: { title: string; id: number }) => (
    <div data-testid={`media-card-${id}`}>{title}</div>
  ),
}));

import { QuickPickPage } from './QuickPickPage';

const makeMovie = (id: number, title: string) => ({
  id,
  title,
  releaseDate: '2024-01-01',
  posterUrl: `/poster-${id}.jpg`,
  runtime: 120,
  voteAverage: 7.5,
  genres: ['Action'],
  overview: `Overview for ${title}`,
});

function resolveWith(movies: ReturnType<typeof makeMovie>[]) {
  mockLibraryQuickPick.mockResolvedValue({ data: { data: movies } });
}

function renderPage(route = '/media/quick-pick') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [route] }, children)
    );
  return render(<QuickPickPage />, { wrapper });
}

describe('QuickPickPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the correct number of movies (default 3)', async () => {
    resolveWith([makeMovie(1, 'Movie A'), makeMovie(2, 'Movie B'), makeMovie(3, 'Movie C')]);

    renderPage();

    expect(await screen.findByTestId('media-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('media-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('media-card-3')).toBeInTheDocument();
  });

  it('passes count from ?count= query param to the query', async () => {
    resolveWith([makeMovie(1, 'A'), makeMovie(2, 'B')]);

    renderPage('/media/quick-pick?count=2');

    await waitFor(() => expect(mockLibraryQuickPick).toHaveBeenCalledWith({ query: { count: 2 } }));
  });

  it('defaults invalid count param to 3', async () => {
    resolveWith([makeMovie(1, 'A'), makeMovie(2, 'B'), makeMovie(3, 'C')]);

    renderPage('/media/quick-pick?count=99');

    await waitFor(() => expect(mockLibraryQuickPick).toHaveBeenCalledWith({ query: { count: 3 } }));
  });

  it('renders count selector with 2, 3, 4, 5 options', async () => {
    resolveWith([makeMovie(1, 'A')]);

    renderPage();

    for (const n of [2, 3, 4, 5]) {
      expect(await screen.findByRole('button', { name: String(n) })).toBeInTheDocument();
    }
  });

  it('highlights the active count option', async () => {
    resolveWith([makeMovie(1, 'A')]);

    renderPage('/media/quick-pick?count=4');

    const btn4 = await screen.findByRole('button', { name: '4' });
    expect(btn4.getAttribute('aria-pressed')).toBe('true');
    const btn3 = screen.getByRole('button', { name: '3' });
    expect(btn3.getAttribute('aria-pressed')).toBe('false');
  });

  it("calls refetch when 'Show me others' is clicked", async () => {
    const user = userEvent.setup();
    resolveWith([makeMovie(1, 'A')]);

    renderPage();

    const btn = await screen.findByRole('button', { name: /show me others/i });
    await waitFor(() => expect(mockLibraryQuickPick).toHaveBeenCalledTimes(1));
    await user.click(btn);

    await waitFor(() => expect(mockLibraryQuickPick).toHaveBeenCalledTimes(2));
  });

  it("renders 'Watch This' button for each movie", async () => {
    resolveWith([makeMovie(1, 'Movie A'), makeMovie(2, 'Movie B')]);

    renderPage('/media/quick-pick?count=2');

    const watchButtons = await screen.findAllByRole('button', { name: /watch this/i });
    expect(watchButtons).toHaveLength(2);
  });

  it('renders empty state when no unwatched movies', async () => {
    resolveWith([]);

    renderPage();

    expect(await screen.findByText('Nothing unwatched in your library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search for movies/i })).toBeInTheDocument();
  });

  it('renders partial fill when fewer movies than count', async () => {
    resolveWith([makeMovie(1, 'Only One')]);

    renderPage('/media/quick-pick?count=5');

    expect(await screen.findByTestId('media-card-1')).toBeInTheDocument();
    expect(screen.getByText('Only One')).toBeInTheDocument();
    const watchButtons = screen.getAllByRole('button', { name: /watch this/i });
    expect(watchButtons).toHaveLength(1);
  });

  it('shows loading skeletons', () => {
    mockLibraryQuickPick.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.queryByText('Quick Pick')).not.toBeInTheDocument();
  });
});
