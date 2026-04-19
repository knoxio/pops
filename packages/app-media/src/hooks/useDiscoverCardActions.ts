/**
 * useDiscoverCardActions — shared mutations and callbacks for DiscoverCard interactions.
 *
 * Encapsulates add-to-library, watchlist, watched, rewatch, and dismiss mutations
 * so they can be reused across the discover page and dynamic shelf sections.
 */
import { trpc } from '@pops/api-client';

import { useDiscoverMutations } from './discover-actions/discoverMutations';
import {
  useAddToLibrary,
  useAddToWatchlist,
  useMarkRewatched,
  useMarkWatched,
  useNotInterested,
  useRemoveFromWatchlist,
} from './discover-actions/handlers';
import { usePendingSet } from './discover-actions/usePendingSet';

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

export function useDiscoverCardActions(): DiscoverCardActions {
  const utils = trpc.useUtils();
  const mutations = useDiscoverMutations();

  const addingToLibrary = usePendingSet();
  const addingToWatchlist = usePendingSet();
  const removingFromWatchlist = usePendingSet();
  const markingWatched = usePendingSet();
  const markingRewatched = usePendingSet();
  const dismissing = usePendingSet();
  const optimistic = usePendingSet();

  return {
    addingToLibrary: addingToLibrary.set,
    addingToWatchlist: addingToWatchlist.set,
    removingFromWatchlist: removingFromWatchlist.set,
    markingWatched: markingWatched.set,
    markingRewatched: markingRewatched.set,
    dismissing: dismissing.set,
    optimisticDismissed: optimistic.set,
    onAddToLibrary: useAddToLibrary({ mutations, utils, pending: addingToLibrary }),
    onAddToWatchlist: useAddToWatchlist({ mutations, utils, pending: addingToWatchlist }),
    onRemoveFromWatchlist: useRemoveFromWatchlist({
      mutations,
      utils,
      pending: removingFromWatchlist,
    }),
    onMarkWatched: useMarkWatched({ mutations, utils, pending: markingWatched }),
    onMarkRewatched: useMarkRewatched({ mutations, utils, pending: markingRewatched }),
    onNotInterested: useNotInterested({ mutations, utils, dismissing, optimistic }),
  };
}
