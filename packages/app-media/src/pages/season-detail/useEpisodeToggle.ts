import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseEpisodeToggleArgs {
  watchHistory: Array<{ id: number; mediaId: number }> | undefined;
}

export function useEpisodeToggle({ watchHistory }: UseEpisodeToggleArgs) {
  const utils = trpc.useUtils();
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const removeToggling = (episodeId: number) => {
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(episodeId);
      return next;
    });
  };

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { mediaId: number }) => {
      removeToggling(variables.mediaId);
    },
  });

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to remove watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { id: number }) => {
      const episodeId = deleteEntryToEpisode.current.get(variables.id);
      deleteEntryToEpisode.current.delete(variables.id);
      if (episodeId != null) removeToggling(episodeId);
    },
  });

  const handleToggleWatched = useCallback(
    (episodeId: number, watched: boolean) => {
      setTogglingIds((prev) => new Set(prev).add(episodeId));

      if (watched) {
        logMutation.mutate({ mediaType: 'episode', mediaId: episodeId });
        return;
      }

      const entry = watchHistory?.find((e) => e.mediaId === episodeId);
      if (entry) {
        deleteEntryToEpisode.current.set(entry.id, episodeId);
        deleteMutation.mutate({ id: entry.id });
      } else {
        removeToggling(episodeId);
      }
    },
    [logMutation, deleteMutation, watchHistory]
  );

  return { togglingIds, handleToggleWatched };
}
