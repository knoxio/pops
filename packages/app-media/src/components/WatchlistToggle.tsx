import { Button } from "@pops/ui";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

type DisplayMediaType = "movie" | "tv";
type ApiMediaType = "movie" | "tv_show";

const toApiMediaType = (type: DisplayMediaType): ApiMediaType => (type === "tv" ? "tv_show" : type);

export interface WatchlistToggleProps {
  mediaType: DisplayMediaType;
  mediaId: number;
  className?: string;
}

export function WatchlistToggle({ mediaType, mediaId, className }: WatchlistToggleProps) {
  const utils = trpc.useUtils();
  const apiMediaType = toApiMediaType(mediaType);

  const queryKey = { mediaType: apiMediaType };

  const { data: watchlistData, isLoading: isChecking } = trpc.media.watchlist.list.useQuery(
    queryKey,
    { staleTime: 30_000 }
  );

  const watchlistEntry = watchlistData?.data?.find(
    (entry: { mediaId: number }) => entry.mediaId === mediaId
  );
  const isOnWatchlist = !!watchlistEntry;

  const addMutation = trpc.media.watchlist.add.useMutation({
    onMutate: async () => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await utils.media.watchlist.list.cancel(queryKey);

      // Snapshot the previous value
      const previousData = utils.media.watchlist.list.getData(queryKey);

      // Optimistically add a placeholder entry to the cache
      utils.media.watchlist.list.setData(queryKey, (old) => {
        if (!old) return old;
        const placeholder = {
          id: -1,
          mediaType: apiMediaType,
          mediaId,
          priority: null,
          notes: null,
          addedAt: new Date().toISOString(),
        };
        return { ...old, data: [...old.data, placeholder] };
      });

      return { previousData };
    },
    onSuccess: () => {
      toast.success("Added to watchlist");
    },
    onError: (err, _vars, context) => {
      // Revert optimistic update
      if (context?.previousData) {
        utils.media.watchlist.list.setData(queryKey, context.previousData);
      }
      if ((err as { data?: { code?: string } | null }).data?.code === "CONFLICT") {
        toast.info("Already on watchlist");
      } else {
        toast.error(`Failed to add: ${err.message}`);
      }
    },
    onSettled: () => {
      void utils.media.watchlist.list.invalidate(queryKey);
    },
  });

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onMutate: async () => {
      await utils.media.watchlist.list.cancel(queryKey);

      const previousData = utils.media.watchlist.list.getData(queryKey);

      // Optimistically remove the entry from cache
      utils.media.watchlist.list.setData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((entry: { mediaId: number }) => entry.mediaId !== mediaId),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      toast.success("Removed from watchlist");
    },
    onError: (err, _vars, context) => {
      // Revert optimistic update
      if (context?.previousData) {
        utils.media.watchlist.list.setData(queryKey, context.previousData);
      }
      toast.error(`Failed to remove: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchlist.list.invalidate(queryKey);
    },
  });

  const isMutating = addMutation.isPending || removeMutation.isPending;

  const handleToggle = () => {
    if (isMutating) return;

    if (isOnWatchlist && watchlistEntry) {
      removeMutation.mutate({ id: watchlistEntry.id });
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
      variant={isOnWatchlist ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      loading={isMutating}
      loadingText={isOnWatchlist ? "Removing" : "Adding"}
      prefix={
        isOnWatchlist ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />
      }
      aria-label={isOnWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      className={className}
    >
      {isOnWatchlist ? "On Watchlist" : "Add to Watchlist"}
    </Button>
  );
}
