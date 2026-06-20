import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchHistoryDelete, watchHistoryLog } from '../../media-api/index.js';

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

function useLogMutation(queryClient: QueryClient, removeToggling: (id: number) => void) {
  return useMutation({
    mutationFn: async (variables: LogInput) =>
      unwrap(
        await watchHistoryLog({
          body: {
            mediaType: variables.mediaType,
            mediaId: variables.mediaId,
            completed: 1,
            source: 'manual',
          },
        })
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'tvShows', 'listSeasons'] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
    onSettled: (_data, _err, variables) => {
      if (variables) removeToggling(variables.mediaId);
    },
  });
}

function useDeleteMutation(
  queryClient: QueryClient,
  deleteEntryToEpisode: React.RefObject<Map<number, number>>,
  removeToggling: (id: number) => void
) {
  return useMutation({
    mutationFn: async (variables: DeleteInput) =>
      unwrap(await watchHistoryDelete({ path: { id: variables.id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['media', 'tvShows', 'listSeasons'] });
    },
    onError: (err: Error) => {
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
  const queryClient = useQueryClient();
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const removeToggling = useCallback((episodeId: number) => {
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(episodeId);
      return next;
    });
  }, []);

  const logMutation = useLogMutation(queryClient, removeToggling);
  const deleteMutation = useDeleteMutation(queryClient, deleteEntryToEpisode, removeToggling);

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
