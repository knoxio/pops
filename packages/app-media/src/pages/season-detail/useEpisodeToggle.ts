import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

interface UseEpisodeToggleArgs {
  watchHistory: Array<{ id: number; mediaId: number }> | undefined;
}

interface LogInput {
  mediaType: 'episode';
  mediaId: number;
}

interface DeleteInput {
  id: number;
}

function useLogMutation(utils: UsePillarUtilsResult, removeToggling: (id: number) => void) {
  return usePillarMutation<LogInput, unknown>('media', ['watchHistory', 'log'], {
    onSuccess: () => {
      void utils.invalidate(['tvShows', 'listSeasons']);
    },
    onError: (err) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
    onSettled: (_data, _err, variables) => {
      if (variables) removeToggling(variables.mediaId);
    },
  });
}

function useDeleteMutation(
  utils: UsePillarUtilsResult,
  deleteEntryToEpisode: React.RefObject<Map<number, number>>,
  removeToggling: (id: number) => void
) {
  return usePillarMutation<DeleteInput, unknown>('media', ['watchHistory', 'delete'], {
    onSuccess: () => {
      void utils.invalidate(['tvShows', 'listSeasons']);
    },
    onError: (err) => {
      toast.error(`Failed to remove watch: ${err.message}`);
    },
    onSettled: (_data, _err, variables) => {
      if (!variables) return;
      const episodeId = deleteEntryToEpisode.current.get(variables.id);
      deleteEntryToEpisode.current.delete(variables.id);
      if (episodeId != null) removeToggling(episodeId);
    },
  });
}

export function useEpisodeToggle({ watchHistory }: UseEpisodeToggleArgs) {
  const utils = usePillarUtils('media');
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const removeToggling = useCallback((episodeId: number) => {
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(episodeId);
      return next;
    });
  }, []);

  const logMutation = useLogMutation(utils, removeToggling);
  const deleteMutation = useDeleteMutation(utils, deleteEntryToEpisode, removeToggling);

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
    [logMutation, deleteMutation, watchHistory, removeToggling]
  );

  return { togglingIds, handleToggleWatched };
}
