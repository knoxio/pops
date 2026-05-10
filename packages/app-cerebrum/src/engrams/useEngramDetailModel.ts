/**
 * View model for the Engram detail / edit page.
 *
 * Splits responsibilities across small hooks (form state, autosave,
 * mutation) so each function stays under the project line-limit and
 * the dependency graph between effects is obvious. The page component
 * is purely presentational against the returned shape.
 */
import { useCallback, useMemo } from 'react';

import { trpc } from '@pops/api-client';

import { clearDraft } from './draft-storage';
import { findInvalidScopes, normaliseScope } from './scope-validation';
import { useEngramFormState, type EngramFormState } from './useEngramFormState';

import type { Engram } from './types';

export type { EngramFormState } from './useEngramFormState';

export interface EngramDetailModel {
  id: string;
  isLoading: boolean;
  error: { message: string } | null;
  notFound: boolean;
  engram: Engram | null;
  body: string;
  connectedEngrams: Engram[];
  isEditing: boolean;
  beginEdit: () => void;
  cancelEdit: () => void;
  form: EngramFormState;
  updateForm: (patch: Partial<EngramFormState>) => void;
  validationErrors: string[];
  isSaving: boolean;
  saveError: { message: string } | null;
  save: () => void;
  /** Set when a draft was restored from localStorage on mount. */
  draftRestored: boolean;
  discardDraft: () => void;
}

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown error';
}

function validate(
  form: EngramFormState,
  t: (key: string, vars?: Record<string, string>) => string
): string[] {
  const errors: string[] = [];
  if (!form.title.trim()) errors.push(t('engrams.edit.errors.titleRequired'));
  if (form.scopes.length === 0) errors.push(t('engrams.edit.errors.scopesRequired'));
  for (const invalid of findInvalidScopes(form.scopes)) {
    errors.push(t('engrams.edit.errors.invalidScope', { scope: invalid }));
  }
  return errors;
}

function resolveError(err: unknown): { message: string } | null {
  if (!err) return null;
  return { message: extractMessage(err) };
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const data = (err as { data?: { code?: string } }).data;
  return data?.code === 'NOT_FOUND';
}

interface UseEngramDetailOptions {
  id: string;
  storage?: Storage;
  t: (key: string, vars?: Record<string, string>) => string;
}

export function useEngramDetailModel(options: UseEngramDetailOptions): EngramDetailModel {
  const { id, storage, t } = options;
  const utils = trpc.useUtils();

  const getQuery = trpc.cerebrum.engrams.get.useQuery({ id });
  const engram = getQuery.data?.engram ?? null;
  const body = getQuery.data?.body ?? '';
  const linkIds = useMemo(() => engram?.links ?? [], [engram]);
  const connectedQuery = trpc.cerebrum.engrams.list.useQuery(
    { ids: linkIds, limit: linkIds.length || 1 },
    { enabled: linkIds.length > 0 }
  );

  const formState = useEngramFormState({ engram, body, storage });

  const updateMutation = trpc.cerebrum.engrams.update.useMutation({
    onSuccess: async () => {
      if (engram) clearDraft(engram.id, storage);
      formState.finishEditing();
      await utils.cerebrum.engrams.get.invalidate({ id });
      await utils.cerebrum.engrams.list.invalidate();
    },
  });

  const validationErrors = useMemo(
    () => (formState.isEditing ? validate(formState.form, t) : []),
    [formState.isEditing, formState.form, t]
  );

  const save = useCallback(() => {
    if (!engram || validationErrors.length > 0) return;
    updateMutation.mutate({
      id: engram.id,
      title: formState.form.title.trim(),
      body: formState.form.body,
      scopes: formState.form.scopes.map(normaliseScope),
      tags: formState.form.tags,
      status: formState.form.status,
    });
  }, [engram, formState.form, validationErrors, updateMutation]);

  return {
    id,
    isLoading: getQuery.isLoading,
    error: resolveError(getQuery.error),
    notFound: isNotFound(getQuery.error),
    engram,
    body,
    connectedEngrams: connectedQuery.data?.engrams ?? [],
    isEditing: formState.isEditing,
    beginEdit: formState.beginEdit,
    cancelEdit: formState.cancelEdit,
    form: formState.form,
    updateForm: formState.updateForm,
    validationErrors,
    isSaving: updateMutation.isPending,
    saveError: resolveError(updateMutation.error),
    save,
    draftRestored: formState.draftRestored,
    discardDraft: formState.discardDraft,
  };
}
