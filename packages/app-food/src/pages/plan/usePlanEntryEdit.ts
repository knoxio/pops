/**
 * Edit-sheet mutation wiring for `PlanEntryEditSheet` — extracted so
 * the sheet component fits within the per-function line cap.
 */
import { useState } from 'react';

import { trpc } from '@pops/api-client';

interface Opts {
  entryId: number;
  onSaved: () => void;
  onDeleted: () => void;
}

export function usePlanEntryEdit({ entryId, onSaved, onDeleted }: Opts) {
  const utils = trpc.useUtils();
  const invalidate = () => void utils.food.plan.weekView.invalidate();
  const [error, setError] = useState<string | null>(null);

  const updateEntry = trpc.food.plan.updateEntry.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        invalidate();
        onSaved();
      } else {
        setError(`Could not save: ${res.reason}`);
      }
    },
    onError: (err) => setError(err.message),
  });

  const deleteEntry = trpc.food.plan.deleteEntry.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        invalidate();
        onDeleted();
      } else {
        setError(`Could not delete: ${res.reason}`);
      }
    },
    onError: (err) => setError(err.message),
  });

  const save = (plannedServings: number, notes: string) => {
    updateEntry.mutate({
      id: entryId,
      plannedServings,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  const remove = () => deleteEntry.mutate({ id: entryId });

  return {
    save,
    remove,
    isSaving: updateEntry.isPending,
    isDeleting: deleteEntry.isPending,
    error,
  };
}
