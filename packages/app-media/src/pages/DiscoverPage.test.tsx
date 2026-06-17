import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAssembleSession = vi.fn();
const mockProfile = vi.fn();
const mockGetDismissed = vi.fn();

vi.mock('../media-api/index.js', () => ({
  discoveryAssembleSession: () => mockAssembleSession(),
  discoveryProfile: () => mockProfile(),
  discoveryGetDismissed: () => mockGetDismissed(),
}));

vi.mock('../hooks/useDiscoverCardActions', () => ({
  useDiscoverCardActions: () => ({
    addingToLibrary: new Set<number>(),
    addingToWatchlist: new Set<number>(),
    markingWatched: new Set<number>(),
    markingRewatched: new Set<number>(),
    dismissing: new Set<number>(),
    optimisticDismissed: new Set<number>(),
    onAddToLibrary: vi.fn(),
    onAddToWatchlist: vi.fn(),
    onMarkWatched: vi.fn(),
    onMarkRewatched: vi.fn(),
    onNotInterested: vi.fn(),
  }),
}));

vi.mock('../components/ShelfSection', () => ({
  ShelfSection: ({ shelfId, title }: { shelfId: string; title: string }) => (
    <section data-testid={`shelf-${shelfId}`}>
      <h2>{title}</h2>
    </section>
  ),
}));

vi.mock('../components/PreferenceProfile', () => ({
  PreferenceProfile: () => <div data-testid="preference-profile" />,
}));

import { DiscoverPage } from './DiscoverPage';

function makeShelf(shelfId: string, title: string) {
  return {
    shelfId,
    title,
    subtitle: null,
    emoji: null,
    items: [],
    hasMore: false,
  };
}

function defaultProfile(totalComparisons = 10) {
  mockProfile.mockResolvedValue({
    data: {
      data: {
        totalComparisons,
        totalMoviesWatched: 10,
        genreDistribution: [],
        genreAffinities: [],
        dimensionWeights: [],
      },
    },
  });
}

function defaultDismissed() {
  mockGetDismissed.mockResolvedValue({ data: { data: [] } });
}

function defaultSession(shelves = [makeShelf('trending-tmdb', 'Trending')]) {
  mockAssembleSession.mockResolvedValue({ data: { shelves } });
}

function setupDefaults() {
  defaultProfile();
  defaultDismissed();
  defaultSession();
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/media/discover'] }, children)
    );
  return render(<DiscoverPage />, { wrapper });
}

describe('DiscoverPage — loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProfile();
    defaultDismissed();
  });

  it('renders loading skeleton while assembleSession is in flight', () => {
    mockAssembleSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('does not render shelf sections while loading', () => {
    mockAssembleSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryByTestId(/^shelf-/)).toBeNull();
  });
});

describe('DiscoverPage — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProfile();
    defaultDismissed();
  });

  it('shows error message when assembleSession fails', async () => {
    mockAssembleSession.mockResolvedValue({ error: { message: 'Server error' } });
    renderPage();

    expect(await screen.findByText(/Failed to load discover shelves/)).toBeTruthy();
  });

  it('does not render shelves on error', async () => {
    mockAssembleSession.mockResolvedValue({ error: { message: 'Server error' } });
    renderPage();

    await screen.findByText(/Failed to load discover shelves/);
    expect(screen.queryByTestId(/^shelf-/)).toBeNull();
  });
});

describe('DiscoverPage — shelf rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProfile();
    defaultDismissed();
  });

  it('renders a ShelfSection for each shelf returned by assembly', async () => {
    defaultSession([
      makeShelf('trending-tmdb', 'Trending'),
      makeShelf('hidden-gems', 'Hidden Gems'),
      makeShelf('new-releases', 'New Releases'),
    ]);
    renderPage();

    expect(await screen.findByTestId('shelf-trending-tmdb')).toBeTruthy();
    expect(screen.getByTestId('shelf-hidden-gems')).toBeTruthy();
    expect(screen.getByTestId('shelf-new-releases')).toBeTruthy();
  });

  it('renders shelves in the order returned by assembly', async () => {
    defaultSession([
      makeShelf('shelf-a', 'Shelf A'),
      makeShelf('shelf-b', 'Shelf B'),
      makeShelf('shelf-c', 'Shelf C'),
    ]);
    renderPage();

    await screen.findByTestId('shelf-shelf-a');
    const sections = screen.getAllByRole('heading', { level: 2 });
    expect(sections[0]!.textContent).toBe('Shelf A');
    expect(sections[1]!.textContent).toBe('Shelf B');
    expect(sections[2]!.textContent).toBe('Shelf C');
  });

  it('shows empty state spinner when assembly returns no shelves', async () => {
    defaultSession([]);
    renderPage();

    expect(await screen.findByText('Assembling your discover page…')).toBeTruthy();
  });

  it('renders page header always', async () => {
    setupDefaults();
    renderPage();

    expect(await screen.findByText('Discover')).toBeTruthy();
    expect(screen.getByText('Find your next favourite movie')).toBeTruthy();
  });
});

describe('DiscoverPage — compare-to-unlock CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultDismissed();
    defaultSession();
  });

  it('shows CTA when totalComparisons < 5', async () => {
    defaultProfile(2);
    renderPage();

    expect(await screen.findByText('Compare more movies to unlock recommendations')).toBeTruthy();
  });

  it('shows exact comparison count in CTA', async () => {
    defaultProfile(3);
    renderPage();

    expect(await screen.findByText(/you have 3 so far/)).toBeTruthy();
  });

  it('links CTA to /media/compare', async () => {
    defaultProfile(0);
    renderPage();

    const link = (await screen.findByText('Start Comparing')).closest('a');
    expect(link?.getAttribute('href')).toBe('/media/compare');
  });

  it('hides CTA when totalComparisons >= 5', async () => {
    defaultProfile(5);
    renderPage();

    await screen.findByTestId('preference-profile');
    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });

  it('hides CTA when totalComparisons > 5', async () => {
    defaultProfile(10);
    renderPage();

    await screen.findByTestId('preference-profile');
    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });

  it('hides CTA while profile is loading', () => {
    mockProfile.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });
});

describe('DiscoverPage — PreferenceProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('renders PreferenceProfile', async () => {
    renderPage();

    expect(await screen.findByTestId('preference-profile')).toBeTruthy();
  });
});

describe('DiscoverPage — Refresh button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('renders the Refresh button', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /refresh shelf selection/i })).toBeTruthy();
  });

  it('calls session refetch on click', async () => {
    const user = userEvent.setup();
    renderPage();

    const btn = await screen.findByRole('button', { name: /refresh shelf selection/i });
    await waitFor(() => expect(mockAssembleSession).toHaveBeenCalledTimes(1));
    await user.click(btn);

    await waitFor(() => expect(mockAssembleSession).toHaveBeenCalledTimes(2));
  });

  it('disables Refresh button while isFetching', () => {
    mockAssembleSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    const btn = screen.getByRole('button', { name: /refresh shelf selection/i });
    expect(btn).toBeDisabled();
  });
});
