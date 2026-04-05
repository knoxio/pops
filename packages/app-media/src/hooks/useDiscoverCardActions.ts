/**
 * useDiscoverCardActions — shared mutations and callbacks for DiscoverCard interactions.
 *
 * Encapsulates add-to-library, watchlist, watched, rewatch, and dismiss mutations
 * so they can be reused across the discover page and dynamic shelf sections.
 */
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

export interface DiscoverCardActions {
  /** Set of tmdbIds currently being added to library. */
  addingToLibrary: Set<number>;
  /** Set of tmdbIds currently being added to watchlist. */
  addingToWatchlist: Set<number>;
  /** Set of tmdbIds currently being marked watched. */
  markingWatched: Set<number>;
  /** Set of tmdbIds currently being marked rewatched. */
  markingRewatched: Set<number>;
  /** Set of tmdbIds currently being dismissed. */
  dismissing: Set<number>;
  /** Set of optimistically dismissed tmdbIds (hidden immediately, confirmed later). */
  optimisticDismissed: Set<number>;
  onAddToLibrary: (tmdbId: number) => void;
  onAddToWatchlist: (tmdbId: number) => void;
  onMarkWatched: (tmdbId: number) => void;
  onMarkRewatched: (tmdbId: number) => void;
  onNotInterested: (tmdbId: number) => void;
  isDismissed: (tmdbId: number) => void;
}

export function useDiscoverCardActions() {
  const utils = trpc.useUtils();

  const [addingToLibrary, setAddingToLibrary] = useState<Set<number>>(new Set());
  const [addingToWatchlist, setAddingToWatchlist] = useState<Set<number>>(new Set());
  const [markingWatched, setMarkingWatched] = useState<Set<number>>(new Set());
  const [markingRewatched, setMarkingRewatched] = useState<Set<number>>(new Set());
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<number>>(new Set());

  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addWatchlistMutation = trpc.media.watchlist.add.useMutation();
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
        void utils.media.discovery.assembleSession.invalidate();
      } catch {
        toast.error("Failed to add to library");
      } finally {
        setAddingToLibrary((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, utils]
  );

  const onAddToWatchlist = useCallback(
    async (tmdbId: number) => {
      setAddingToWatchlist((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        const watchlistResult = await addWatchlistMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        if (watchlistResult.created) {
          toast.success(`Added "${libResult.data.title}" to watchlist`);
        } else {
          toast.info(`"${libResult.data.title}" is already on watchlist`);
        }
        void utils.media.watchlist.list.invalidate();
      } catch {
        toast.error("Failed to add to watchlist");
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

  const onMarkWatched = useCallback(
    async (tmdbId: number) => {
      setMarkingWatched((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        await logWatchMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        toast.success(`Marked "${libResult.data.title}" as watched`);
        void utils.media.discovery.assembleSession.invalidate();
      } catch {
        toast.error("Failed to mark as watched");
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
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        toast.success(`Logged rewatch of "${libResult.data.title}"`);
      } catch {
        toast.error("Failed to log rewatch");
      } finally {
        setMarkingRewatched((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, logWatchMutation]
  );

  const onNotInterested = useCallback(
    async (tmdbId: number) => {
      setOptimisticDismissed((prev) => new Set(prev).add(tmdbId));
      setDismissing((prev) => new Set(prev).add(tmdbId));
      try {
        await dismissMutation.mutateAsync({ tmdbId });
        void utils.media.discovery.getDismissed.invalidate();
      } catch {
        setOptimisticDismissed((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
        toast.error("Failed to dismiss");
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
    markingWatched,
    markingRewatched,
    dismissing,
    optimisticDismissed,
    onAddToLibrary,
    onAddToWatchlist,
    onMarkWatched,
    onMarkRewatched,
    onNotInterested,
  };
}
