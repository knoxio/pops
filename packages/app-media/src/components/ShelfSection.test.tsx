import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getShelfPageMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  discoveryGetShelfPage: (...args: unknown[]) => getShelfPageMock(...args),
}));

// Mock IntersectionObserver — trigger callback immediately to make sections visible
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

vi.stubGlobal(
  'IntersectionObserver',
  vi.fn().mockImplementation(function (
    this: IntersectionObserver,
    callback: IntersectionObserverCallback
  ) {
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    this.observe = mockObserve;
    this.disconnect = mockDisconnect;
  })
);

// Mock DiscoverCard to avoid pulling in RequestMovieButton (which requires the arr SDK)
vi.mock('./DiscoverCard', () => ({
  DiscoverCard: ({ title, tmdbId }: { title: string; tmdbId: number }) => (
    <div data-testid={`card-${tmdbId}`}>{title}</div>
  ),
}));

import { ShelfSection } from './ShelfSection';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeItem(tmdbId: number) {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    releaseDate: '2024-01-01',
    posterPath: null,
    posterUrl: null,
    voteAverage: 7.5,
    inLibrary: false,
    isWatched: false,
    onWatchlist: false,
  };
}

const noopActions = {
  dismissedSet: new Set<number>(),
  addingToLibrary: new Set<number>(),
  addingToWatchlist: new Set<number>(),
  removingFromWatchlist: new Set<number>(),
  markingWatched: new Set<number>(),
  markingRewatched: new Set<number>(),
  dismissing: new Set<number>(),
  onAddToLibrary: vi.fn(async () => ({ ok: true })),
  onAddToWatchlist: vi.fn(async () => ({ ok: true })),
  onRemoveFromWatchlist: vi.fn(async () => ({ ok: true })),
  onMarkWatched: vi.fn(async () => ({ ok: true })),
  onMarkRewatched: vi.fn(async () => ({ ok: true })),
  onNotInterested: vi.fn(async () => ({ ok: true })),
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderShelf(
  overrides: Partial<{
    shelfId: string;
    title: string;
    subtitle: string;
    initialItems: ReturnType<typeof makeItem>[];
    hasMore: boolean;
    dismissedSet: Set<number>;
  }> = {}
) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <ShelfSection
      shelfId={overrides.shelfId ?? 'best-in-genre:drama'}
      title={overrides.title ?? 'Best in Drama'}
      subtitle={overrides.subtitle}
      initialItems={overrides.initialItems ?? [makeItem(1), makeItem(2), makeItem(3)]}
      hasMore={overrides.hasMore ?? false}
      {...noopActions}
      dismissedSet={overrides.dismissedSet ?? noopActions.dismissedSet}
    />,
    { wrapper }
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  getShelfPageMock.mockResolvedValue(
    ok({ items: [makeItem(101), makeItem(102)], hasMore: false, totalCount: null })
  );
});

describe('ShelfSection — rendering', () => {
  it('renders shelf title', () => {
    renderShelf({ title: 'Best in Drama' });
    expect(screen.getByText('Best in Drama')).toBeInTheDocument();
  });

  it('renders shelf subtitle when provided', () => {
    renderShelf({ title: 'Best in Drama', subtitle: 'Top-rated drama films' });
    expect(screen.getByText('Top-rated drama films')).toBeInTheDocument();
  });

  it('renders all initial items', () => {
    renderShelf({ initialItems: [makeItem(1), makeItem(2), makeItem(3)] });
    expect(screen.getByText('Movie 1')).toBeInTheDocument();
    expect(screen.getByText('Movie 2')).toBeInTheDocument();
    expect(screen.getByText('Movie 3')).toBeInTheDocument();
  });

  it('hides dismissed items', () => {
    renderShelf({
      initialItems: [makeItem(1), makeItem(2), makeItem(3)],
      dismissedSet: new Set([2]),
    });
    expect(screen.getByText('Movie 1')).toBeInTheDocument();
    expect(screen.queryByText('Movie 2')).not.toBeInTheDocument();
    expect(screen.getByText('Movie 3')).toBeInTheDocument();
  });
});

describe('ShelfSection — show more', () => {
  it('does not render Show more button when hasMore=false', () => {
    renderShelf({ hasMore: false });
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('renders Show more button when hasMore=true', () => {
    renderShelf({ hasMore: true });
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('calls getShelfPage with correct shelfId and offset on Show more click', async () => {
    const user = userEvent.setup();
    renderShelf({
      shelfId: 'best-in-genre:drama',
      initialItems: [makeItem(1), makeItem(2), makeItem(3)],
      hasMore: true,
    });

    await user.click(screen.getByRole('button', { name: /show more/i }));

    await waitFor(() =>
      expect(getShelfPageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { shelfId: 'best-in-genre:drama' },
          query: expect.objectContaining({ offset: 3 }),
        })
      )
    );
  });

  it('appends new items after Show more', async () => {
    const user = userEvent.setup();
    renderShelf({ initialItems: [makeItem(1), makeItem(2), makeItem(3)], hasMore: true });

    await user.click(screen.getByRole('button', { name: /show more/i }));

    await waitFor(() => {
      expect(screen.getByText('Movie 101')).toBeInTheDocument();
      expect(screen.getByText('Movie 102')).toBeInTheDocument();
    });
  });

  it('hides Show more button after last page loaded (hasMore=false from server)', async () => {
    const user = userEvent.setup();
    getShelfPageMock.mockResolvedValue(
      ok({ items: [makeItem(101)], hasMore: false, totalCount: null })
    );

    renderShelf({ hasMore: true });

    await user.click(screen.getByRole('button', { name: /show more/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument()
    );
  });
});

describe('ShelfSection — lazy loading', () => {
  it('renders content immediately when IntersectionObserver fires on mount', () => {
    renderShelf({ title: 'Best in Drama', initialItems: [makeItem(1)] });
    expect(screen.getByText('Best in Drama')).toBeInTheDocument();
    expect(screen.getByText('Movie 1')).toBeInTheDocument();
  });
});
