import { Compass, Loader2, RefreshCw, Swords } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';

/**
 * DiscoverPage — dynamic shelf-based movie discovery.
 *
 * Calls assembleSession to get a personalised, freshness-weighted set of shelves,
 * then renders each as a lazy-loaded ShelfSection. All card interactions
 * (add to library, watchlist, watched, dismiss) are handled by useDiscoverCardActions.
 */
import { Button, Skeleton } from '@pops/ui';

import { PreferenceProfile } from '../components/PreferenceProfile';
import { ShelfSection } from '../components/ShelfSection';
import { useDiscoverCardActions } from '../hooks/useDiscoverCardActions';
import { trpc } from '../lib/trpc';

const COMPARISON_THRESHOLD = 5;

export function DiscoverPage() {
  const session = trpc.media.discovery.assembleSession.useQuery(undefined, {
    staleTime: 0, // Always fresh — assembly is randomised per session
  });

  const profile = trpc.media.discovery.profile.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const dismissed = trpc.media.discovery.getDismissed.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const actions = useDiscoverCardActions();

  const totalComparisons = profile.data?.data?.totalComparisons ?? 0;
  const hasEnoughComparisons = totalComparisons >= COMPARISON_THRESHOLD;

  const dismissedSet = useMemo(
    () => new Set([...(dismissed.data?.data ?? []), ...Array.from(actions.optimisticDismissed)]),
    [dismissed.data, actions.optimisticDismissed]
  );

  const shelves = session.data?.shelves ?? [];

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Discover</h1>
          <p className="text-sm text-muted-foreground">Find your next favourite movie</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh shelf selection"
          disabled={session.isFetching}
          onClick={() => void session.refetch()}
        >
          {session.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Compare-to-unlock prompt for new users */}
      {!hasEnoughComparisons && !profile.isLoading && (
        <section className="rounded-lg border border-dashed border-border p-8 text-center">
          <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Compare more movies to unlock recommendations</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You need at least {COMPARISON_THRESHOLD} comparisons — you have {totalComparisons} so
            far.
          </p>
          <Link
            to="/media/compare"
            className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Start Comparing
          </Link>
        </section>
      )}

      {/* Loading skeleton while assembleSession is running */}
      {session.isLoading && (
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
      )}

      {/* Assembly error */}
      {session.error && !session.isLoading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load discover shelves. Please refresh the page.
        </div>
      )}

      {/* Dynamic shelf sections */}
      {!session.isLoading &&
        shelves.map((shelf) => (
          <ShelfSection
            key={shelf.shelfId}
            shelfId={shelf.shelfId}
            title={shelf.title}
            subtitle={shelf.subtitle}
            emoji={shelf.emoji}
            initialItems={shelf.items.map((item) => ({
              tmdbId: item.tmdbId,
              title: item.title,
              releaseDate: item.releaseDate,
              posterPath: item.posterPath,
              posterUrl: item.posterUrl,
              voteAverage: item.voteAverage,
              inLibrary: item.inLibrary,
              isWatched: item.isWatched,
              onWatchlist: item.onWatchlist,
            }))}
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

      {/* Empty state — assembly returned no shelves */}
      {!session.isLoading && !session.error && shelves.length === 0 && (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Assembling your discover page…</p>
        </div>
      )}

      {/* Preference Profile */}
      <PreferenceProfile data={profile.data?.data} isLoading={profile.isLoading} />
    </div>
  );
}
