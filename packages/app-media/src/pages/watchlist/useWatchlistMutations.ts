import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { WatchlistEntry } from './types';

interface MutationsArgs {
  setIsReordering: (v: boolean) => void;
  setOptimisticOrder: (v: WatchlistEntry[] | null) => void;
}

export function useWatchlistMutations({ setIsReordering, setOptimisticOrder }: MutationsArgs) {
  const utils = trpc.useUtils();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
      setRemovingId(null);
      toast.success('Removed from watchlist');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  const updateMutation = trpc.media.watchlist.update.useMutation({
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success('Notes saved');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (error: { message: string }) => {
      setUpdateErrorMsg(error.message ?? 'Failed to save notes');
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });

  const reorderMutation = trpc.media.watchlist.reorder.useMutation({
    onSuccess: () => {
      setOptimisticOrder(null);
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setOptimisticOrder(null);
      toast.error(`Failed to reorder: ${err.message}`);
    },
    onSettled: () => {
      setIsReordering(false);
    },
  });

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
