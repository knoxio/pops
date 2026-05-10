/**
 * Form-state hook for the engram edit view.
 *
 * Owns the local edit copy of an engram (title/body/scopes/tags/status),
 * hydrates it on mount from localStorage if a matching draft exists,
 * and autosaves to localStorage on every change while editing.
 *
 * Separated from `useEngramDetailModel` so the line/complexity limits
 * stay sane and effect dependencies are easy to audit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearDraft, readDraft, writeDraft } from './draft-storage';
import { type Engram, type EngramDraft, type EngramStatus } from './types';

export interface EngramFormState {
  title: string;
  body: string;
  scopes: string[];
  tags: string[];
  status: EngramStatus;
}

interface UseFormStateArgs {
  engram: Engram | null;
  body: string;
  storage?: Storage;
}

interface UseFormStateResult {
  form: EngramFormState;
  updateForm: (patch: Partial<EngramFormState>) => void;
  isEditing: boolean;
  draftRestored: boolean;
  beginEdit: () => void;
  cancelEdit: () => void;
  finishEditing: () => void;
  discardDraft: () => void;
}

const EMPTY_FORM: EngramFormState = {
  title: '',
  body: '',
  scopes: [],
  tags: [],
  status: 'active',
};

function buildFormFromEngram(engram: Engram, body: string): EngramFormState {
  return {
    title: engram.title,
    body,
    scopes: [...engram.scopes],
    tags: [...engram.tags],
    status: engram.status,
  };
}

function buildDraft(form: EngramFormState, engram: Engram): EngramDraft {
  return {
    id: engram.id,
    title: form.title,
    body: form.body,
    scopes: [...form.scopes],
    tags: [...form.tags],
    status: form.status,
    updatedAt: new Date().toISOString(),
    baseContentHash: engram.contentHash,
  };
}

/** Hydrate the form on first arrival of an engram, restoring a fresh draft. */
function useHydration(
  args: UseFormStateArgs,
  setForm: (form: EngramFormState) => void,
  setDraftRestored: (value: boolean) => void
): void {
  const { engram, body, storage } = args;
  const initialisedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!engram || initialisedFor.current === engram.id) return;
    initialisedFor.current = engram.id;
    const existing = readDraft(engram.id, storage);
    if (existing && existing.baseContentHash === engram.contentHash) {
      setForm({
        title: existing.title,
        body: existing.body,
        scopes: existing.scopes,
        tags: existing.tags,
        status: existing.status,
      });
      setDraftRestored(true);
      return;
    }
    if (existing) clearDraft(engram.id, storage);
    setForm(buildFormFromEngram(engram, body));
    setDraftRestored(false);
  }, [engram, body, storage, setForm, setDraftRestored]);
}

export function useEngramFormState(args: UseFormStateArgs): UseFormStateResult {
  const { engram, body, storage } = args;
  const [form, setForm] = useState<EngramFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  useHydration(args, setForm, setDraftRestored);

  // Autosave the in-flight edit to localStorage while the user is editing.
  useEffect(() => {
    if (!engram || !isEditing) return;
    writeDraft(buildDraft(form, engram), storage);
  }, [form, engram, isEditing, storage]);

  const updateForm = useCallback(
    (patch: Partial<EngramFormState>) => setForm((prev) => ({ ...prev, ...patch })),
    []
  );

  const beginEdit = useCallback(() => setIsEditing(true), []);
  const finishEditing = useCallback(() => {
    setIsEditing(false);
    setDraftRestored(false);
  }, []);

  const cancelEdit = useCallback(() => {
    if (!engram) return;
    setForm(buildFormFromEngram(engram, body));
    setIsEditing(false);
    setDraftRestored(false);
    clearDraft(engram.id, storage);
  }, [engram, body, storage]);

  const discardDraft = useCallback(() => {
    if (!engram) return;
    clearDraft(engram.id, storage);
    setForm(buildFormFromEngram(engram, body));
    setDraftRestored(false);
  }, [engram, body, storage]);

  return {
    form,
    updateForm,
    isEditing,
    draftRestored,
    beginEdit,
    cancelEdit,
    finishEditing,
    discardDraft,
  };
}
