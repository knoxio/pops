import { Bookmark, BookmarkCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@pops/ui';

import { trpc } from '../lib/trpc';

type DisplayMediaType = 'movie' | 'tv';
type ApiMediaType = 'movie' | 'tv_show';

const toApiMediaType = (type: DisplayMediaType): ApiMediaType => (type === 'tv' ? 'tv_show' : type);

export interface WatchlistToggleProps {
  mediaType: DisplayMediaType;
  mediaId: number;
  className?: string;
}

export function WatchlistToggle({ mediaType, mediaId, className }: WatchlistToggleProps) {
  const utils = trpc.useUtils();
  const apiMediaType = toApiMediaType(mediaType);

  const { data: statusData, isLoading: isChecking } = trpc.media.watchlist.status.useQuery(
    { mediaType: apiMediaType, mediaId },
    { staleTime: 30_000 }
  );

  const isOnWatchlist = statusData?.onWatchlist ?? false;
  const watchlistEntryId = statusData?.entryId ?? null;

  const addMutation = trpc.media.watchlist.add.useMutation({
    onMutate: async () => {
      await utils.media.watchlist.status.cancel({ mediaType: apiMediaType, mediaId });
      const previous = utils.media.watchlist.status.getData({ mediaType: apiMediaType, mediaId });
      utils.media.watchlist.status.setData({ mediaType: apiMediaType, mediaId }, () => ({
        onWatchlist: true,
        entryId: -1,
      }));
      return { previous };
    },
    onSuccess: () => {
      toast.success('Added to watchlist');
    },
    onError: (err: { message: string; data?: { code?: string } | null }, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.media.watchlist.status.setData(
          { mediaType: apiMediaType, mediaId },
          context.previous
        );
      }
      if (err.data?.code === 'CONFLICT') {
        toast.info('Already on watchlist');
      } else {
        toast.error(`Failed to add: ${err.message}`);
      }
    },
    onSettled: () => {
      void utils.media.watchlist.status.invalidate({ mediaType: apiMediaType, mediaId });
    },
  });

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onMutate: async () => {
      await utils.media.watchlist.status.cancel({ mediaType: apiMediaType, mediaId });
      const previous = utils.media.watchlist.status.getData({ mediaType: apiMediaType, mediaId });
      utils.media.watchlist.status.setData({ mediaType: apiMediaType, mediaId }, () => ({
        onWatchlist: false,
        entryId: null,
      }));
      return { previous };
    },
    onSuccess: () => {
      toast.success('Removed from watchlist');
    },
    onError: (err: { message: string }, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.media.watchlist.status.setData(
          { mediaType: apiMediaType, mediaId },
          context.previous
        );
      }
      toast.error(`Failed to remove: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchlist.status.invalidate({ mediaType: apiMediaType, mediaId });
    },
  });

  const isMutating = addMutation.isPending || removeMutation.isPending;

  const handleToggle = () => {
    if (isMutating) return;

    if (isOnWatchlist && watchlistEntryId !== null) {
      removeMutation.mutate({ id: watchlistEntryId });
    } else {
      addMutation.mutate({ mediaType: apiMediaType, mediaId });
    }
  };

  if (isChecking) {
    return (
      <Button
        variant="outline"
        size="sm"
        loading
        loadingText="Checking watchlist"
        aria-label="Checking watchlist status"
        className={className}
      >
        Loading
      </Button>
    );
  }

  return (
    <Button
      variant={isOnWatchlist ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggle}
      loading={isMutating}
      loadingText={isOnWatchlist ? 'Removing' : 'Adding'}
      prefix={
        isOnWatchlist ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />
      }
      aria-label={isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      className={className}
    >
      {isOnWatchlist ? 'On Watchlist' : 'Add to Watchlist'}
    </Button>
  );
}
