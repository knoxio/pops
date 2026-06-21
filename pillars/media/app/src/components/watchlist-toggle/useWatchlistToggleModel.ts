import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchlistAdd, watchlistRemove, watchlistStatus } from '../../media-api/index.js';

type ApiMediaType = 'movie' | 'tv_show';

type WatchlistStatus = { onWatchlist: boolean; entryId: number | null };

type WatchlistMutationContext = { previous: WatchlistStatus | undefined };

function statusQueryKey(apiMediaType: ApiMediaType, mediaId: number) {
  return ['media', 'watchlist', 'status', { mediaType: apiMediaType, mediaId }] as const;
}

async function snapshotAndApply(
  queryClient: QueryClient,
  apiMediaType: ApiMediaType,
  mediaId: number,
  next: WatchlistStatus
): Promise<WatchlistMutationContext> {
  const key = statusQueryKey(apiMediaType, mediaId);
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<WatchlistStatus>(key);
  queryClient.setQueryData<WatchlistStatus>(key, next);
  return { previous };
}

function rollback(
  queryClient: QueryClient,
  apiMediaType: ApiMediaType,
  mediaId: number,
  context: WatchlistMutationContext | undefined
) {
  if (!context) return;
  queryClient.setQueryData<WatchlistStatus | undefined>(
    statusQueryKey(apiMediaType, mediaId),
    context.previous
  );
}

function useAddMutation(apiMediaType: ApiMediaType, mediaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { mediaType: ApiMediaType; mediaId: number }) =>
      unwrap(await watchlistAdd({ body: vars })),
    onMutate: () =>
      snapshotAndApply(queryClient, apiMediaType, mediaId, { onWatchlist: true, entryId: -1 }),
    onSuccess: () => {
      toast.success('Added to watchlist');
    },
    onError: (err: Error, _vars, context) => {
      rollback(queryClient, apiMediaType, mediaId, context);
      toast.error(`Failed to add: ${err.message}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'status'] });
    },
  });
}

function useRemoveMutation(apiMediaType: ApiMediaType, mediaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number }) =>
      unwrap(await watchlistRemove({ path: { id: vars.id } })),
    onMutate: () =>
      snapshotAndApply(queryClient, apiMediaType, mediaId, { onWatchlist: false, entryId: null }),
    onSuccess: () => {
      toast.success('Removed from watchlist');
    },
    onError: (err: Error, _vars, context) => {
      rollback(queryClient, apiMediaType, mediaId, context);
      toast.error(`Failed to remove: ${err.message}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'status'] });
    },
  });
}

export function useWatchlistToggleModel(apiMediaType: ApiMediaType, mediaId: number) {
  const { data: statusData, isLoading: isChecking } = useQuery({
    queryKey: statusQueryKey(apiMediaType, mediaId),
    queryFn: async () =>
      unwrap(await watchlistStatus({ query: { mediaType: apiMediaType, mediaId } })),
    staleTime: 30_000,
  });

  const isOnWatchlist = statusData?.onWatchlist ?? false;
  const watchlistEntryId = statusData?.entryId ?? null;

  const addMutation = useAddMutation(apiMediaType, mediaId);
  const removeMutation = useRemoveMutation(apiMediaType, mediaId);

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
