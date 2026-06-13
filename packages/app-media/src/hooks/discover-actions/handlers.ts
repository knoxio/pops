import { useCallback } from 'react';
import { toast } from 'sonner';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

import type { DiscoverActionResult } from '../useDiscoverCardActions';
import type { useDiscoverMutations } from './discoverMutations';
import type { usePendingSet } from './usePendingSet';

type Mutations = ReturnType<typeof useDiscoverMutations>;
type Pending = ReturnType<typeof usePendingSet>;
type PillarUtils = UsePillarUtilsResult;

interface WatchlistStatusResponse {
  onWatchlist: boolean;
  entryId: number | null;
}

interface AddDeps {
  mutations: Mutations;
  utils: PillarUtils;
  pending: Pending;
}

export function useAddToLibrary({ mutations, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const result = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        if (result.created) toast.success(`Added "${result.data.title}" to library`);
        else toast.info(`"${result.data.title}" is already in library`);
        return { ok: true, inLibrary: true };
      } catch {
        toast.error('Failed to add to library');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, pending]
  );
}

export function useAddToWatchlist({ mutations, utils, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        const wlResult = await mutations.addWatchlistMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        if (wlResult.created) toast.success(`Added "${libResult.data.title}" to watchlist`);
        else toast.info(`"${libResult.data.title}" is already on watchlist`);
        void utils.invalidate(['watchlist', 'list']);
        return { ok: true, inLibrary: true, onWatchlist: true };
      } catch {
        toast.error('Failed to add to watchlist');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, utils, pending]
  );
}

export function useRemoveFromWatchlist({ mutations, utils, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        const status = await utils.fetchQuery<WatchlistStatusResponse>(['watchlist', 'status'], {
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        if (!status.onWatchlist || status.entryId == null) {
          toast.info(`"${libResult.data.title}" is not on your watchlist`);
          return { ok: true, inLibrary: true, onWatchlist: false };
        }
        await mutations.removeWatchlistMutation.mutateAsync({ id: status.entryId });
        toast.success(`Removed "${libResult.data.title}" from watchlist`);
        void utils.invalidate(['watchlist', 'list']);
        return { ok: true, inLibrary: true, onWatchlist: false };
      } catch {
        toast.error('Failed to remove from watchlist');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, utils, pending]
  );
}

export function useMarkWatched({ mutations, utils, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        const watchResult = await mutations.logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        toast.success(`Marked "${libResult.data.title}" as watched`);
        if (watchResult.watchlistRemoved) {
          void utils.invalidate(['watchlist', 'list']);
        }
        void utils.invalidate(['comparisons', 'getPendingDebriefs']);
        return {
          ok: true,
          inLibrary: true,
          isWatched: true,
          onWatchlist: watchResult.watchlistRemoved ? false : undefined,
        };
      } catch {
        toast.error('Failed to mark as watched');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, utils, pending]
  );
}

export function useMarkRewatched({ mutations, utils, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        await mutations.logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
        });
        toast.success(`Logged rewatch of "${libResult.data.title}"`);
        void utils.invalidate(['comparisons', 'getPendingDebriefs']);
        return { ok: true, inLibrary: true, isWatched: true };
      } catch {
        toast.error('Failed to log rewatch');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, utils, pending]
  );
}

export function useNotInterested({
  mutations,
  utils,
  dismissing,
  optimistic,
}: {
  mutations: Mutations;
  utils: PillarUtils;
  dismissing: Pending;
  optimistic: Pending;
}) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      optimistic.add(tmdbId);
      dismissing.add(tmdbId);
      try {
        await mutations.dismissMutation.mutateAsync({ tmdbId });
        void utils.invalidate(['discovery', 'getDismissed']);
        return { ok: true };
      } catch {
        optimistic.remove(tmdbId);
        toast.error('Failed to dismiss');
        return { ok: false };
      } finally {
        dismissing.remove(tmdbId);
      }
    },
    [mutations, utils, dismissing, optimistic]
  );
}
