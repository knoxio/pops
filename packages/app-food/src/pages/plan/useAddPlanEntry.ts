/**
 * Local form/mutation state for the AddPlanEntryModal — extracted so
 * the modal stays under the per-function line cap.
 */
import { useState } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type RecipesListOutput = inferRouterOutputs<AppRouter>['food']['recipes']['list'];
type PlanAddEntryInput = inferRouterInputs<AppRouter>['food']['plan']['addEntry'];
type PlanAddEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['addEntry'];

interface Opts {
  date: string;
  slot: string;
  isOpen: boolean;
  onAdded?: (entryId: number) => void;
  onClose: () => void;
}

interface FormState {
  search: string;
  setSearch: (s: string) => void;
  recipeId: number | null;
  setRecipeId: (n: number | null) => void;
  plannedServings: number;
  setPlannedServings: (n: number) => void;
  notes: string;
  setNotes: (s: string) => void;
  error: string | null;
  setError: (s: string | null) => void;
  reset: () => void;
}

function useAddFormState(): FormState {
  const [search, setSearch] = useState('');
  const [recipeId, setRecipeId] = useState<number | null>(null);
  const [plannedServings, setPlannedServings] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setSearch('');
    setRecipeId(null);
    setPlannedServings(1);
    setNotes('');
    setError(null);
  };
  return {
    search,
    setSearch,
    recipeId,
    setRecipeId,
    plannedServings,
    setPlannedServings,
    notes,
    setNotes,
    error,
    setError,
    reset,
  };
}

export function useAddPlanEntry({ date, slot, isOpen, onAdded, onClose }: Opts) {
  const f = useAddFormState();
  const utils = usePillarUtils('food');
  const recipesQuery = usePillarQuery<RecipesListOutput>(
    'food',
    ['recipes', 'list'],
    { search: f.search || undefined, includeArchived: false, limit: 25 },
    { enabled: isOpen }
  );
  const addEntry = usePillarMutation<PlanAddEntryInput, PlanAddEntryOutput>(
    'food',
    ['plan', 'addEntry'],
    {
      onSuccess: (res) => {
        if (res.ok) {
          void utils.invalidate(['plan', 'weekView']);
          if (onAdded) onAdded(res.id);
          f.reset();
          onClose();
          return;
        }
        f.setError(`Could not add: ${res.reason}`);
      },
      onError: (err) => f.setError(err.message),
    }
  );
  const submit = () => {
    if (f.recipeId === null) return;
    addEntry.mutate({
      date,
      slot,
      recipeId: f.recipeId,
      plannedServings: f.plannedServings,
      notes: f.notes.trim() === '' ? undefined : f.notes.trim(),
    });
  };
  const options = mapRecipeOptions(recipesQuery.data?.items ?? []);
  return {
    ...f,
    options,
    isRecipesLoading: recipesQuery.isLoading,
    submit,
    canSubmit: f.recipeId !== null && f.plannedServings >= 1 && !addEntry.isPending,
    isPending: addEntry.isPending,
  };
}

interface RecipeListItem {
  id: number;
  title: string | null;
  slug: string;
}

function mapRecipeOptions(items: readonly RecipeListItem[]): { value: string; label: string }[] {
  return items.map((r) => ({ value: String(r.id), label: r.title ?? r.slug }));
}
