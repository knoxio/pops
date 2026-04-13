/**
 * useDiscoverCardActions — shared mutations and callbacks for DiscoverCard interactions.
 *
 * Encapsulates add-to-library, watchlist, watched, rewatch, and dismiss mutations
 * so they can be reused across the discover page and dynamic shelf sections.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

export type DiscoverActionResult =
  | {
      ok: true;
      /** Whether this action ensured the movie exists in the library DB. */
      inLibrary?: boolean;
      /** Whether the movie should be considered watched. */
      isWatched?: boolean;
      /** Whether the movie should be considered on the watchlist. */
      onWatchlist?: boolean;
    }
  | { ok: false };

export interface DiscoverCardActions {
  /** Set of tmdbIds currently being added to library. */
  addingToLibrary: Set<number>;
  /** Set of tmdbIds currently being added to watchlist. */
  addingToWatchlist: Set<number>;
  /** Set of tmdbIds currently being removed from watchlist. */
  removingFromWatchlist: Set<number>;
  /** Set of tmdbIds currently being marked watched. */
  markingWatched: Set<number>;
  /** Set of tmdbIds currently being marked rewatched. */
  markingRewatched: Set<number>;
  /** Set of tmdbIds currently being dismissed. */
  dismissing: Set<number>;
  /** Set of optimistically dismissed tmdbIds (hidden immediately, confirmed later). */
  optimisticDismissed: Set<number>;
  onAddToLibrary: (tmdbId: number) => Promise<DiscoverActionResult>;
  onAddToWatchlist: (tmdbId: number) => Promise<DiscoverActionResult>;
  onRemoveFromWatchlist: (tmdbId: number) => Promise<DiscoverActionResult>;
  onMarkWatched: (tmdbId: number) => Promise<DiscoverActionResult>;
  onMarkRewatched: (tmdbId: number) => Promise<DiscoverActionResult>;
  onNotInterested: (tmdbId: number) => Promise<DiscoverActionResult>;
}

export function useDiscoverCardActions() {
  const utils = trpc.useUtils();

  const [addingToLibrary, setAddingToLibrary] = useState<Set<number>>(new Set());
  const [addingToWatchlist, setAddingToWatchlist] = useState<Set<number>>(new Set());
  const [removingFromWatchlist, setRemovingFromWatchlist] = useState<Set<number>>(new Set());
  const [markingWatched, setMarkingWatched] = useState<Set<number>>(new Set());
  const [markingRewatched, setMarkingRewatched] = useState<Set<number>>(new Set());
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<number>>(new Set());

  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addWatchlistMutation = trpc.media.watchlist.add.useMutation();
  const removeWatchlistMutation = trpc.media.watchlist.remove.useMutation();
  const logWatchMutation = trpc.media.watchHistory.log.useMutation();
  const dismissMutation = trpc.media.discovery.dismiss.useMutation();

  const onAddToLibrary = useCallback(
    async (tmdbId: number) => {
      setAddingToLibrary((prev) => new Set(prev).add(tmdbId));
      try {
        const result = await addMovieMutation.mutateAsync({ tmdbId });
        if (result.created) {
          toast.success(`Added "${result.data.title}" to library`);
        } else {
          toast.info(`"${result.data.title}" is already in library`);
        }
        return { ok: true, inLibrary: true } as const;
      } catch {
        toast.error('Failed to add to library');
        return { ok: false } as const;
      } finally {
        setAddingToLibrary((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation]
  );

  const onAddToWatchlist = useCallback(
    async (tmdbId: number) => {
      setAddingToWatchlist((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        const watchlistResult = await addWatchlistMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        if (watchlistResult.created) {
          toast.success(`Added "${libResult.data.title}" to watchlist`);
        } else {
          toast.info(`"${libResult.data.title}" is already on watchlist`);
        }
        void utils.media.watchlist.list.invalidate();
        return { ok: true, inLibrary: true, onWatchlist: true } as const;
      } catch {
        toast.error('Failed to add to watchlist');
        return { ok: false } as const;
      } finally {
        setAddingToWatchlist((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, addWatchlistMutation, utils]
  );

  const onRemoveFromWatchlist = useCallback(
    async (tmdbId: number) => {
      setRemovingFromWatchlist((prev) => new Set(prev).add(tmdbId));
      try {
        // Ensure we have a library mediaId to query watchlist status.
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        const status = await utils.media.watchlist.status.fetch({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });

        if (!status.onWatchlist || status.entryId == null) {
          toast.info(`"${libResult.data.title}" is not on your watchlist`);
          return { ok: true, inLibrary: true, onWatchlist: false } as const;
        }

        await removeWatchlistMutation.mutateAsync({ id: status.entryId });
        toast.success(`Removed "${libResult.data.title}" from watchlist`);
        void utils.media.watchlist.list.invalidate();
        return { ok: true, inLibrary: true, onWatchlist: false } as const;
      } catch {
        toast.error('Failed to remove from watchlist');
        return { ok: false } as const;
      } finally {
        setRemovingFromWatchlist((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, removeWatchlistMutation, utils]
  );

  const onMarkWatched = useCallback(
    async (tmdbId: number) => {
      setMarkingWatched((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        const watchResult = await logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        toast.success(`Marked "${libResult.data.title}" as watched`);
        if (watchResult.watchlistRemoved) {
          void utils.media.watchlist.list.invalidate();
        }
        void utils.media.comparisons.getPendingDebriefs.invalidate();
        return {
          ok: true,
          inLibrary: true,
          isWatched: true,
          onWatchlist: watchResult.watchlistRemoved ? false : undefined,
        } as const;
      } catch {
        toast.error('Failed to mark as watched');
        return { ok: false } as const;
      } finally {
        setMarkingWatched((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, logWatchMutation, utils]
  );

  const onMarkRewatched = useCallback(
    async (tmdbId: number) => {
      setMarkingRewatched((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        await logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        toast.success(`Logged rewatch of "${libResult.data.title}"`);
        void utils.media.comparisons.getPendingDebriefs.invalidate();
        return { ok: true, inLibrary: true, isWatched: true } as const;
      } catch {
        toast.error('Failed to log rewatch');
        return { ok: false } as const;
      } finally {
        setMarkingRewatched((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, logWatchMutation, utils]
  );

  const onNotInterested = useCallback(
    async (tmdbId: number) => {
      setOptimisticDismissed((prev) => new Set(prev).add(tmdbId));
      setDismissing((prev) => new Set(prev).add(tmdbId));
      try {
        await dismissMutation.mutateAsync({ tmdbId });
        void utils.media.discovery.getDismissed.invalidate();
        return { ok: true } as const;
      } catch {
        setOptimisticDismissed((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
        toast.error('Failed to dismiss');
        return { ok: false } as const;
      } finally {
        setDismissing((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [dismissMutation, utils]
  );

  return {
    addingToLibrary,
    addingToWatchlist,
    removingFromWatchlist,
    markingWatched,
    markingRewatched,
    dismissing,
    optimisticDismissed,
    onAddToLibrary,
    onAddToWatchlist,
    onRemoveFromWatchlist,
    onMarkWatched,
    onMarkRewatched,
    onNotInterested,
  };
}
