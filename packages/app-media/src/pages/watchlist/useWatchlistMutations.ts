import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../media-api-helpers.js';
import { watchlistRemove, watchlistReorder, watchlistUpdate } from '../../media-api/index.js';

import type { WatchlistEntry } from './types';

interface MutationsArgs {
  setIsReordering: (v: boolean) => void;
  setOptimisticOrder: (v: WatchlistEntry[] | null) => void;
}

interface RemoveInput {
  id: number;
}

interface UpdateInput {
  id: number;
  data: { notes: string | null };
}

interface ReorderInput {
  items: Array<{ id: number; priority: number }>;
}

function useRemoveMutation(setRemovingId: (v: number | null) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveInput) =>
      unwrap(await watchlistRemove({ path: { id: input.id } })),
    onSuccess: () => {
      setRemovingId(null);
      toast.success('Removed from watchlist');
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'list'] });
    },
    onError: (err: Error) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });
}

function useUpdateMutation(
  setUpdateErrorId: (v: number | null) => void,
  setUpdateErrorMsg: (v: string | null) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInput) =>
      unwrap(await watchlistUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success('Notes saved');
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'list'] });
    },
    onError: (error: Error) => {
      setUpdateErrorMsg(error.message ?? 'Failed to save notes');
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });
}

function useReorderMutation(args: MutationsArgs) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderInput) => unwrap(await watchlistReorder({ body: input })),
    onSuccess: () => {
      args.setOptimisticOrder(null);
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'list'] });
    },
    onError: (err: Error) => {
      args.setOptimisticOrder(null);
      toast.error(`Failed to reorder: ${err.message}`);
    },
    onSettled: () => {
      args.setIsReordering(false);
    },
  });
}

export function useWatchlistMutations(args: MutationsArgs) {
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);

  const removeMutation = useRemoveMutation(setRemovingId);
  const updateMutation = useUpdateMutation(setUpdateErrorId, setUpdateErrorMsg);
  const reorderMutation = useReorderMutation(args);

  return {
    removeMutation,
    updateMutation,
    reorderMutation,
    removingId,
    setRemovingId,
    updateErrorId,
    setUpdateErrorId,
    updateErrorMsg,
    setUpdateErrorMsg,
  };
}
