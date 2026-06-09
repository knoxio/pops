/**
 * Pure helpers for `SendToListModal` — extracted from the component file
 * to stay under the per-file lint cap.
 */
import { formatPrefillListName } from './format-prefill-name.js';

import type { FormState } from './types.js';
import type { ShoppingList } from './useSendToListData.js';

export const initialForm: FormState = { kind: 'new', listId: null, newName: '' };

/**
 * Seed the form on first open. Picks `kind='existing'` when at least one
 * shopping list exists and the user hasn't already chosen a listId; falls
 * back to `kind='new'` with a prefilled date-stamped name. Called once per
 * open via a `seededRef` gate in the modal so subsequent lists-list query
 * refetches don't override a user's explicit choice (Copilot R1).
 */
export function seedFormFromData(prev: FormState, hasExistingLists: boolean): FormState {
  const kind = hasExistingLists && prev.listId === null ? 'existing' : prev.kind;
  const newName = prev.newName === '' ? formatPrefillListName(new Date()) : prev.newName;
  return { ...prev, kind, newName };
}

export function resolveListName(
  form: FormState,
  shoppingLists: readonly ShoppingList[],
  resultListId: number
): string {
  if (form.kind === 'new') return form.newName.trim();
  const match = shoppingLists.find((l) => l.id === resultListId);
  return match?.name ?? '';
}

export function computeCanSubmit(
  form: FormState,
  isLoading: boolean,
  isPending: boolean,
  itemCount: number
): boolean {
  if (isLoading || isPending || itemCount === 0) return false;
  if (form.kind === 'existing') return form.listId !== null;
  return form.newName.trim().length > 0;
}

export interface SubmitInput {
  versionId: number;
  scaleFactor: number;
  target: { kind: 'existing'; listId: number } | { kind: 'new'; name: string };
}

export function buildSubmitInput(
  versionId: number,
  scaleFactor: number,
  form: FormState
): SubmitInput {
  if (form.kind === 'existing' && form.listId !== null) {
    return {
      versionId,
      scaleFactor,
      target: { kind: 'existing', listId: form.listId },
    };
  }
  return {
    versionId,
    scaleFactor,
    target: { kind: 'new', name: form.newName.trim() },
  };
}
