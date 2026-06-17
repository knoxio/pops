import { type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchlistStatus } from '../../media-api/index.js';

import type { DiscoverActionResult } from '../useDiscoverCardActions';
import type { useDiscoverMutations } from './discoverMutations';
import type { usePendingSet } from './usePendingSet';

type Mutations = ReturnType<typeof useDiscoverMutations>;
type Pending = ReturnType<typeof usePendingSet>;

interface AddDeps {
  mutations: Mutations;
  queryClient: QueryClient;
  pending: Pending;
}

function invalidateWatchlist(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'list'] });
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

export function useAddToWatchlist({ mutations, queryClient, pending }: AddDeps) {
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
        void invalidateWatchlist(queryClient);
        return { ok: true, inLibrary: true, onWatchlist: true };
      } catch {
        toast.error('Failed to add to watchlist');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, queryClient, pending]
  );
}

export function useRemoveFromWatchlist({ mutations, queryClient, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        const status = unwrap(
          await watchlistStatus({ query: { mediaType: 'movie', mediaId: libResult.data.id } })
        );
        if (!status.onWatchlist || status.entryId == null) {
          toast.info(`"${libResult.data.title}" is not on your watchlist`);
          return { ok: true, inLibrary: true, onWatchlist: false };
        }
        await mutations.removeWatchlistMutation.mutateAsync({ id: status.entryId });
        toast.success(`Removed "${libResult.data.title}" from watchlist`);
        void invalidateWatchlist(queryClient);
        return { ok: true, inLibrary: true, onWatchlist: false };
      } catch {
        toast.error('Failed to remove from watchlist');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, queryClient, pending]
  );
}

export function useMarkWatched({ mutations, queryClient, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        const watchResult = await mutations.logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
          completed: 1,
          source: 'manual',
        });
        toast.success(`Marked "${libResult.data.title}" as watched`);
        if (watchResult.watchlistRemoved) {
          void invalidateWatchlist(queryClient);
        }
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
    [mutations, queryClient, pending]
  );
}

export function useMarkRewatched({ mutations, pending }: AddDeps) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      pending.add(tmdbId);
      try {
        const libResult = await mutations.addMovieMutation.mutateAsync({ tmdbId });
        await mutations.logWatchMutation.mutateAsync({
          mediaType: 'movie',
          mediaId: libResult.data.id,
          completed: 1,
          source: 'manual',
        });
        toast.success(`Logged rewatch of "${libResult.data.title}"`);
        return { ok: true, inLibrary: true, isWatched: true };
      } catch {
        toast.error('Failed to log rewatch');
        return { ok: false };
      } finally {
        pending.remove(tmdbId);
      }
    },
    [mutations, pending]
  );
}

export function useNotInterested({
  mutations,
  queryClient,
  dismissing,
  optimistic,
}: {
  mutations: Mutations;
  queryClient: QueryClient;
  dismissing: Pending;
  optimistic: Pending;
}) {
  return useCallback(
    async (tmdbId: number): Promise<DiscoverActionResult> => {
      optimistic.add(tmdbId);
      dismissing.add(tmdbId);
      try {
        await mutations.dismissMutation.mutateAsync({ tmdbId });
        void queryClient.invalidateQueries({ queryKey: ['media', 'discovery', 'getDismissed'] });
        return { ok: true };
      } catch {
        optimistic.remove(tmdbId);
        toast.error('Failed to dismiss');
        return { ok: false };
      } finally {
        dismissing.remove(tmdbId);
      }
    },
    [mutations, queryClient, dismissing, optimistic]
  );
}
