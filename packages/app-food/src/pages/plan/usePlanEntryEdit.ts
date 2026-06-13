/**
 * Edit-sheet mutation wiring for `PlanEntryEditSheet` — extracted so
 * the sheet component fits within the per-function line cap.
 */
import { useState } from 'react';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type PlanUpdateEntryInput = inferRouterInputs<AppRouter>['food']['plan']['updateEntry'];
type PlanUpdateEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['updateEntry'];
type PlanDeleteEntryInput = inferRouterInputs<AppRouter>['food']['plan']['deleteEntry'];
type PlanDeleteEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['deleteEntry'];

interface Opts {
  entryId: number;
  onSaved: () => void;
  onDeleted: () => void;
}

export function usePlanEntryEdit({ entryId, onSaved, onDeleted }: Opts) {
  const utils = usePillarUtils('food');
  const invalidate = () => void utils.invalidate(['plan', 'weekView']);
  const [error, setError] = useState<string | null>(null);

  const updateEntry = usePillarMutation<PlanUpdateEntryInput, PlanUpdateEntryOutput>(
    'food',
    ['plan', 'updateEntry'],
    {
      onSuccess: (res) => {
        if (res.ok) {
          invalidate();
          onSaved();
        } else {
          setError(`Could not save: ${res.reason}`);
        }
      },
      onError: (err) => setError(err.message),
    }
  );

  const deleteEntry = usePillarMutation<PlanDeleteEntryInput, PlanDeleteEntryOutput>(
    'food',
    ['plan', 'deleteEntry'],
    {
      onSuccess: (res) => {
        if (res.ok) {
          invalidate();
          onDeleted();
        } else {
          setError(`Could not delete: ${res.reason}`);
        }
      },
      onError: (err) => setError(err.message),
    }
  );

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
