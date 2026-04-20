import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { Dimension, EditState } from './types';

interface MutationsArgs {
  dimensionsLength: number;
  addName: string;
  addDescription: string;
  editing: EditState | null;
  setEditing: (e: EditState | null) => void;
  setAddName: (v: string) => void;
  setAddDescription: (v: string) => void;
  setShowAddForm: (v: boolean) => void;
}

function useCoreMutations(
  args: Pick<MutationsArgs, 'setEditing' | 'setAddName' | 'setAddDescription'>
) {
  const utils = trpc.useUtils();
  const createMutation = trpc.media.comparisons.createDimension.useMutation({
    onSuccess: () => {
      void utils.media.comparisons.listDimensions.invalidate();
      args.setAddName('');
      args.setAddDescription('');
      toast.success('Dimension created');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const updateMutation = trpc.media.comparisons.updateDimension.useMutation({
    onSuccess: () => {
      void utils.media.comparisons.listDimensions.invalidate();
      args.setEditing(null);
      toast.success('Dimension updated');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return { createMutation, updateMutation };
}

function useEditHandlers(
  args: MutationsArgs,
  updateMutation: ReturnType<typeof trpc.media.comparisons.updateDimension.useMutation>
) {
  const handleToggleActive = useCallback(
    (dim: Dimension) => {
      updateMutation.mutate({ id: dim.id, data: { active: !dim.active } });
    },
    [updateMutation]
  );

  const handleStartEdit = useCallback(
    (dim: Dimension) => {
      args.setEditing({
        id: dim.id,
        name: dim.name,
        description: dim.description ?? '',
      });
    },
    [args]
  );

  const handleSaveEdit = useCallback(() => {
    if (!args.editing) return;
    const name = args.editing.name.trim();
    if (!name) return;
    updateMutation.mutate({
      id: args.editing.id,
      data: { name, description: args.editing.description.trim() || null },
    });
  }, [args.editing, updateMutation]);

  return { handleToggleActive, handleStartEdit, handleSaveEdit };
}

function useWeightHandlers(
  updateMutation: ReturnType<typeof trpc.media.comparisons.updateDimension.useMutation>
) {
  const [localWeights, setLocalWeights] = useState<Map<number, number>>(new Map());

  const handleWeightDrag = useCallback((dimId: number, value: number) => {
    setLocalWeights((prev) => new Map(prev).set(dimId, value));
  }, []);

  const handleWeightCommit = useCallback(
    (dim: Dimension, value: number) => {
      updateMutation.mutate(
        { id: dim.id, data: { weight: value } },
        {
          onSettled: () => {
            setLocalWeights((prev) => {
              const next = new Map(prev);
              next.delete(dim.id);
              return next;
            });
          },
        }
      );
    },
    [updateMutation]
  );

  return { localWeights, handleWeightDrag, handleWeightCommit };
}

export function useDimensionMutations(args: MutationsArgs) {
  const { createMutation, updateMutation } = useCoreMutations(args);
  const editHandlers = useEditHandlers(args, updateMutation);
  const weightHandlers = useWeightHandlers(updateMutation);

  const handleAdd = useCallback(() => {
    const name = args.addName.trim();
    if (!name) return;
    createMutation.mutate({
      name,
      description: args.addDescription.trim() || null,
      sortOrder: args.dimensionsLength,
    });
    args.setShowAddForm(false);
  }, [args, createMutation]);

  return {
    createMutation,
    updateMutation,
    handleAdd,
    ...editHandlers,
    ...weightHandlers,
  };
}

export function reorderDimension(
  dimensions: Dimension[],
  dim: Dimension,
  direction: 'up' | 'down',
  mutate: (input: { id: number; data: { sortOrder: number } }, options?: object) => void
): void {
  const sorted = [...dimensions].toSorted((a, b) => a.sortOrder - b.sortOrder);
  const idx = sorted.findIndex((d) => d.id === dim.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const swapTarget = sorted[swapIdx];
  if (!swapTarget) return;
  mutate(
    { id: dim.id, data: { sortOrder: swapTarget.sortOrder } },
    {
      onSuccess: () => {
        mutate({ id: swapTarget.id, data: { sortOrder: dim.sortOrder } });
      },
    }
  );
}
