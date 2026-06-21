/**
 * PRD-151 — local-draft state for the ingredient Tags chip editor.
 *
 * Tracks the in-progress chip set independently of the server payload so
 * the user can add / remove tags freely and only commit on Save. The hook
 * owns:
 *   - draft tag list (seeded from the server, reset on remote refresh)
 *   - pending text input + `commitPending` (Enter key or "Add" button)
 *   - removal handler with normalised local matching
 *   - dirty flag, save / reset wires, server-side error mapping
 *
 * Kept separate from `IngredientTagsEditor.tsx` so the component itself
 * stays under the per-function lint cap (60 lines) and so the draft
 * machinery is unit-testable in isolation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../../food-api-helpers.js';
import { ingredientTagsSet } from '../../../food-api/index.js';

interface TagsSetInput {
  ingredientId: number;
  tags: readonly string[];
}

export interface TagsDraft {
  tags: readonly string[];
  pending: string;
  dirty: boolean;
  isSaving: boolean;
  errorKey: string | null;
  setPending: (value: string) => void;
  commitPending: () => void;
  remove: (tag: string) => void;
  save: () => void;
  reset: () => void;
}

export interface UseTagsDraftInput {
  ingredientId: number;
  remoteTags: readonly string[] | null;
}

export function useTagsDraft({ ingredientId, remoteTags }: UseTagsDraftInput): TagsDraft {
  const setMutation = useSetMutation();
  const stableRemote = useMemo(() => remoteTags ?? [], [remoteTags]);
  const [tags, setTags] = useState<string[]>(stableRemote.slice());
  const [pending, setPending] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    setTags(stableRemote.slice());
    setErrorKey(null);
  }, [stableRemote]);

  const commitPending = () => {
    const value = pending.trim().toLowerCase();
    setPending('');
    if (value.length === 0) return;
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setErrorKey(null);
  };

  const save = () => {
    setErrorKey(null);
    setMutation.mutate(
      { ingredientId, tags },
      {
        onSuccess: (result) => {
          if (!result.ok) setErrorKey(`data.ingredients.tags.error.${result.reason}`);
        },
      }
    );
  };

  return {
    tags,
    pending,
    dirty: !arraysEqual(tags, stableRemote),
    isSaving: setMutation.isPending,
    errorKey,
    setPending,
    commitPending,
    remove: (tag) => {
      setTags((prev) => prev.filter((t) => t !== tag));
      setErrorKey(null);
    },
    save,
    reset: () => {
      setTags(stableRemote.slice());
      setPending('');
      setErrorKey(null);
    },
  };
}

function useSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ingredientId, tags }: TagsSetInput) =>
      unwrap(await ingredientTagsSet({ path: { ingredientId }, body: { tags: [...tags] } })),
    onSuccess: async (result) => {
      if (result.ok) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['food', 'ingredients', 'tags', 'list'] }),
          qc.invalidateQueries({ queryKey: ['food', 'ingredients', 'tags', 'distinct'] }),
        ]);
      }
    },
  });
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].toSorted();
  const sortedB = [...b].toSorted();
  for (let i = 0; i < sortedA.length; i += 1) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}
