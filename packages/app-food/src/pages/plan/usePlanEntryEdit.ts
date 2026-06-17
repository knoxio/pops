import { useMutation, useQueryClient } from '@tanstack/react-query';
/**
 * Edit-sheet mutation wiring for `PlanEntryEditSheet` — extracted so
 * the sheet component fits within the per-function line cap.
 */
import { useState } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { planDeleteEntry, planUpdateEntry } from '../../food-api/index.js';

interface Opts {
  entryId: number;
  onSaved: () => void;
  onDeleted: () => void;
}

export function usePlanEntryEdit({ entryId, onSaved, onDeleted }: Opts) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['food', 'plan', 'weekView'] });
  const [error, setError] = useState<string | null>(null);

  const updateEntry = useMutation({
    mutationFn: async (input: { plannedServings: number; notes: string | null }) =>
      unwrap(await planUpdateEntry({ path: { id: entryId }, body: input })),
    onSuccess: (res) => {
      if (res.ok) {
        invalidate();
        onSaved();
      } else {
        setError(`Could not save: ${res.reason}`);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async () => unwrap(await planDeleteEntry({ path: { id: entryId } })),
    onSuccess: (res) => {
      if (res.ok) {
        invalidate();
        onDeleted();
      } else {
        setError(`Could not delete: ${res.reason}`);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const save = (plannedServings: number, notes: string) => {
    updateEntry.mutate({
      plannedServings,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
  };

  const remove = () => deleteEntry.mutate();

  return {
    save,
    remove,
    isSaving: updateEntry.isPending,
    isDeleting: deleteEntry.isPending,
    error,
  };
}
