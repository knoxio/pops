import { useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

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

function useRemoveMutation(utils: UsePillarUtilsResult, setRemovingId: (v: number | null) => void) {
  return usePillarMutation<RemoveInput, unknown>('media', ['watchlist', 'remove'], {
    onSuccess: () => {
      setRemovingId(null);
      toast.success('Removed from watchlist');
      void utils.invalidate(['watchlist', 'list']);
    },
    onError: (err) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });
}

function useUpdateMutation(
  utils: UsePillarUtilsResult,
  setUpdateErrorId: (v: number | null) => void,
  setUpdateErrorMsg: (v: string | null) => void
) {
  return usePillarMutation<UpdateInput, unknown>('media', ['watchlist', 'update'], {
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success('Notes saved');
      void utils.invalidate(['watchlist', 'list']);
    },
    onError: (error) => {
      setUpdateErrorMsg(error.message ?? 'Failed to save notes');
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });
}

function useReorderMutation(utils: UsePillarUtilsResult, args: MutationsArgs) {
  return usePillarMutation<ReorderInput, unknown>('media', ['watchlist', 'reorder'], {
    onSuccess: () => {
      args.setOptimisticOrder(null);
      void utils.invalidate(['watchlist', 'list']);
    },
    onError: (err) => {
      args.setOptimisticOrder(null);
      toast.error(`Failed to reorder: ${err.message}`);
    },
    onSettled: () => {
      args.setIsReordering(false);
    },
  });
}

export function useWatchlistMutations(args: MutationsArgs) {
  const utils = usePillarUtils('media');
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);

  const removeMutation = useRemoveMutation(utils, setRemovingId);
  const updateMutation = useUpdateMutation(utils, setUpdateErrorId, setUpdateErrorMsg);
  const reorderMutation = useReorderMutation(utils, args);

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
