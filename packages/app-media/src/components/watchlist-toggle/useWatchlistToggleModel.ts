import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

type ApiMediaType = 'movie' | 'tv_show';

type WatchlistStatus = { onWatchlist: boolean; entryId: number | null };

type WatchlistMutationContext = { previous: WatchlistStatus | undefined };

function snapshotAndApply(
  utils: UsePillarUtilsResult,
  apiMediaType: ApiMediaType,
  mediaId: number,
  next: WatchlistStatus
): WatchlistMutationContext {
  const previous = utils.setData<WatchlistStatus>(
    ['watchlist', 'status'],
    { mediaType: apiMediaType, mediaId },
    () => next
  );
  return { previous };
}

function rollback(
  utils: UsePillarUtilsResult,
  apiMediaType: ApiMediaType,
  mediaId: number,
  context: WatchlistMutationContext | undefined
) {
  if (!context) return;
  utils.setData<WatchlistStatus | undefined>(
    ['watchlist', 'status'],
    { mediaType: apiMediaType, mediaId },
    () => context.previous
  );
}

function useAddMutation(apiMediaType: ApiMediaType, mediaId: number, utils: UsePillarUtilsResult) {
  return usePillarMutation<
    { mediaType: ApiMediaType; mediaId: number },
    unknown,
    WatchlistMutationContext
  >('media', ['watchlist', 'add'], {
    onMutate: () =>
      snapshotAndApply(utils, apiMediaType, mediaId, { onWatchlist: true, entryId: -1 }),
    onSuccess: () => {
      toast.success('Added to watchlist');
    },
    onError: (err, _vars, context) => {
      rollback(utils, apiMediaType, mediaId, context);
      toast.error(`Failed to add: ${err.message}`);
    },
    onSettled: () => {
      void utils.invalidate(['watchlist', 'status']);
    },
  });
}

function useRemoveMutation(
  apiMediaType: ApiMediaType,
  mediaId: number,
  utils: UsePillarUtilsResult
) {
  return usePillarMutation<{ id: number }, unknown, WatchlistMutationContext>(
    'media',
    ['watchlist', 'remove'],
    {
      onMutate: () =>
        snapshotAndApply(utils, apiMediaType, mediaId, { onWatchlist: false, entryId: null }),
      onSuccess: () => {
        toast.success('Removed from watchlist');
      },
      onError: (err, _vars, context) => {
        rollback(utils, apiMediaType, mediaId, context);
        toast.error(`Failed to remove: ${err.message}`);
      },
      onSettled: () => {
        void utils.invalidate(['watchlist', 'status']);
      },
    }
  );
}

export function useWatchlistToggleModel(apiMediaType: ApiMediaType, mediaId: number) {
  const utils = usePillarUtils('media');
  const { data: statusData, isLoading: isChecking } = usePillarQuery<WatchlistStatus>(
    'media',
    ['watchlist', 'status'],
    { mediaType: apiMediaType, mediaId },
    { staleTime: 30_000 }
  );

  const isOnWatchlist = statusData?.onWatchlist ?? false;
  const watchlistEntryId = statusData?.entryId ?? null;

  const addMutation = useAddMutation(apiMediaType, mediaId, utils);
  const removeMutation = useRemoveMutation(apiMediaType, mediaId, utils);

  const isMutating = addMutation.isPending || removeMutation.isPending;

  const handleToggle = () => {
    if (isMutating) return;
    if (isOnWatchlist && watchlistEntryId !== null) {
      removeMutation.mutate({ id: watchlistEntryId });
    } else {
      addMutation.mutate({ mediaType: apiMediaType, mediaId });
    }
  };

  return { isChecking, isOnWatchlist, isMutating, handleToggle };
}
