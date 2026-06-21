import { Loader2, RefreshCw, Swords } from 'lucide-react';
import { Link } from 'react-router';

import { Button, Skeleton } from '@pops/ui';

import { ShelfSection } from '../../components/ShelfSection';

import type { useDiscoverCardActions } from '../../hooks/useDiscoverCardActions';

export const COMPARISON_THRESHOLD = 5;

export function CompareUnlockPrompt({
  show,
  totalComparisons,
}: {
  show: boolean;
  totalComparisons: number;
}) {
  if (!show) return null;
  return (
    <section className="rounded-lg border border-dashed border-border p-8 text-center">
      <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Compare more movies to unlock recommendations</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You need at least {COMPARISON_THRESHOLD} comparisons — you have {totalComparisons} so far.
      </p>
      <Link
        to="/media/compare"
        className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        Start Comparing
      </Link>
    </section>
  );
}

export function DiscoverSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-3">
          <div className="px-1">
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex gap-4 overflow-hidden pb-2">
            {Array.from({ length: 6 }, (_, j) => (
              <div key={j} className="w-36 shrink-0 space-y-2 sm:w-40">
                <Skeleton className="aspect-[2/3] w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscoverHeader({
  isFetching,
  onRefresh,
}: {
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-sm text-muted-foreground">Find your next favourite movie</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-label="Refresh shelf selection"
        disabled={isFetching}
        onClick={onRefresh}
      >
        {isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

interface Shelf {
  shelfId: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  items: {
    tmdbId: number;
    title: string;
    releaseDate: string;
    posterPath: string | null;
    posterUrl: string | null;
    voteAverage: number;
    inLibrary: boolean;
    isWatched?: boolean;
    onWatchlist?: boolean;
    rotationExpiresAt?: string;
  }[];
  hasMore: boolean;
}

export function DiscoverShelves({
  shelves,
  dismissedSet,
  actions,
}: {
  shelves: Shelf[];
  dismissedSet: Set<number>;
  actions: ReturnType<typeof useDiscoverCardActions>;
}) {
  return (
    <>
      {shelves.map((shelf) => (
        <ShelfSection
          key={shelf.shelfId}
          shelfId={shelf.shelfId}
          title={shelf.title}
          subtitle={shelf.subtitle}
          emoji={shelf.emoji}
          initialItems={shelf.items}
          hasMore={shelf.hasMore}
          dismissedSet={dismissedSet}
          addingToLibrary={actions.addingToLibrary}
          addingToWatchlist={actions.addingToWatchlist}
          removingFromWatchlist={actions.removingFromWatchlist}
          markingWatched={actions.markingWatched}
          markingRewatched={actions.markingRewatched}
          dismissing={actions.dismissing}
          onAddToLibrary={actions.onAddToLibrary}
          onAddToWatchlist={actions.onAddToWatchlist}
          onRemoveFromWatchlist={actions.onRemoveFromWatchlist}
          onMarkWatched={actions.onMarkWatched}
          onMarkRewatched={actions.onMarkRewatched}
          onNotInterested={actions.onNotInterested}
        />
      ))}
    </>
  );
}
