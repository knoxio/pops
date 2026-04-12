import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAssembleSessionQuery = vi.fn();
const mockAssembleSessionRefetch = vi.fn();
const mockProfileQuery = vi.fn();
const mockGetDismissedQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      discovery: {
        assembleSession: {
          useQuery: (...args: unknown[]) => {
            const result = mockAssembleSessionQuery(...args);
            return { ...result, refetch: mockAssembleSessionRefetch };
          },
        },
        profile: {
          useQuery: (...args: unknown[]) => mockProfileQuery(...args),
        },
        getDismissed: {
          useQuery: (...args: unknown[]) => mockGetDismissedQuery(...args),
        },
      },
    },
  },
}));

// Mock useDiscoverCardActions to avoid wiring up all mutation deps
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

// Mock ShelfSection — renders shelfId + title as a simple section marker
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeShelf(shelfId: string, title: string) {
  return {
    shelfId,
    title,
    subtitle: undefined,
    emoji: undefined,
    items: [],
    hasMore: false,
  };
}

function defaultProfile(totalComparisons = 10) {
  mockProfileQuery.mockReturnValue({
    data: {
      data: {
        totalComparisons,
        totalMoviesWatched: 10,
        genreAffinities: [],
        dimensionWeights: [],
      },
    },
    isLoading: false,
  });
}

function defaultDismissed() {
  mockGetDismissedQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });
}

function defaultSession(shelves = [makeShelf('trending-tmdb', 'Trending')]) {
  mockAssembleSessionQuery.mockReturnValue({
    data: { shelves },
    isLoading: false,
    error: null,
  });
}

function setupDefaults() {
  defaultProfile();
  defaultDismissed();
  defaultSession();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/media/discover']}>
      <DiscoverPage />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiscoverPage — loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProfile();
    defaultDismissed();
  });

  it('renders loading skeleton while assembleSession is in flight', () => {
    mockAssembleSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    renderPage();

    // Skeleton rows are rendered as animated pulse divs — page header still present
    expect(screen.getByText('Discover')).toBeTruthy();
    // No ShelfSection rendered yet
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('does not render shelf sections while loading', () => {
    mockAssembleSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
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

  it('shows error message when assembleSession fails', () => {
    mockAssembleSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Server error' },
    });
    renderPage();

    expect(screen.getByText(/Failed to load discover shelves/)).toBeTruthy();
  });

  it('does not render shelves on error', () => {
    mockAssembleSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Server error' },
    });
    renderPage();

    expect(screen.queryByTestId(/^shelf-/)).toBeNull();
  });
});

describe('DiscoverPage — shelf rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProfile();
    defaultDismissed();
  });

  it('renders a ShelfSection for each shelf returned by assembly', () => {
    defaultSession([
      makeShelf('trending-tmdb', 'Trending'),
      makeShelf('hidden-gems', 'Hidden Gems'),
      makeShelf('new-releases', 'New Releases'),
    ]);
    renderPage();

    expect(screen.getByTestId('shelf-trending-tmdb')).toBeTruthy();
    expect(screen.getByTestId('shelf-hidden-gems')).toBeTruthy();
    expect(screen.getByTestId('shelf-new-releases')).toBeTruthy();
  });

  it('renders shelves in the order returned by assembly', () => {
    defaultSession([
      makeShelf('shelf-a', 'Shelf A'),
      makeShelf('shelf-b', 'Shelf B'),
      makeShelf('shelf-c', 'Shelf C'),
    ]);
    renderPage();

    const sections = screen.getAllByRole('heading', { level: 2 });
    expect(sections[0]!.textContent).toBe('Shelf A');
    expect(sections[1]!.textContent).toBe('Shelf B');
    expect(sections[2]!.textContent).toBe('Shelf C');
  });

  it('shows empty state spinner when assembly returns no shelves', () => {
    defaultSession([]);
    renderPage();

    expect(screen.getByText('Assembling your discover page…')).toBeTruthy();
  });

  it('renders page header always', () => {
    setupDefaults();
    renderPage();

    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.getByText('Find your next favourite movie')).toBeTruthy();
  });
});

describe('DiscoverPage — compare-to-unlock CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultDismissed();
    defaultSession();
  });

  it('shows CTA when totalComparisons < 5', () => {
    defaultProfile(2);
    renderPage();

    expect(screen.getByText('Compare more movies to unlock recommendations')).toBeTruthy();
  });

  it('shows exact comparison count in CTA', () => {
    defaultProfile(3);
    renderPage();

    expect(screen.getByText(/you have 3 so far/)).toBeTruthy();
  });

  it('links CTA to /media/compare', () => {
    defaultProfile(0);
    renderPage();

    const link = screen.getByText('Start Comparing').closest('a');
    expect(link?.getAttribute('href')).toBe('/media/compare');
  });

  it('hides CTA when totalComparisons >= 5', () => {
    defaultProfile(5);
    renderPage();

    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });

  it('hides CTA when totalComparisons > 5', () => {
    defaultProfile(10);
    renderPage();

    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });

  it('hides CTA while profile is loading', () => {
    mockProfileQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();

    expect(screen.queryByText('Compare more movies to unlock recommendations')).toBeNull();
  });
});

describe('DiscoverPage — PreferenceProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('renders PreferenceProfile', () => {
    renderPage();

    expect(screen.getByTestId('preference-profile')).toBeTruthy();
  });
});

describe('DiscoverPage — Refresh button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('renders the Refresh button', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /refresh shelf selection/i })).toBeTruthy();
  });

  it('calls session refetch on click', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /refresh shelf selection/i }));

    expect(mockAssembleSessionRefetch).toHaveBeenCalledTimes(1);
  });

  it('disables Refresh button while isFetching', () => {
    mockAssembleSessionQuery.mockReturnValue({
      data: { shelves: [] },
      isLoading: false,
      isFetching: true,
      error: null,
    });
    renderPage();

    const btn = screen.getByRole('button', { name: /refresh shelf selection/i });
    expect(btn).toBeDisabled();
  });
});
