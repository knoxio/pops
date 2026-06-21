/**
 * View model for the Engram detail / edit page.
 *
 * Splits responsibilities across small hooks (form state, autosave,
 * mutation) so each function stays under the project line-limit and
 * the dependency graph between effects is obvious. The page component
 * is purely presentational against the returned shape.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { engramsGet, engramsList, engramsUpdate } from '../cerebrum-api';
import { isNotFoundError, unwrap } from '../cerebrum-api-helpers';
import { extractMessage } from '../utils/errors';
import { clearDraft } from './draft-storage';
import { findInvalidScopes, normaliseScope } from './scope-validation';
import { useEngramFormState, type EngramFormState } from './useEngramFormState';

import type { Engram, EngramStatus } from './types';

export type { EngramFormState } from './useEngramFormState';

interface EngramUpdateInput {
  id: string;
  title?: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  status?: EngramStatus;
  customFields?: Record<string, unknown>;
}

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

function resolveError(
  err: unknown,
  t: (key: string, vars?: Record<string, string>) => string
): { message: string } | null {
  if (!err) return null;
  return { message: extractMessage(err, t('errors.unknown')) };
}

interface UseEngramDetailOptions {
  id: string;
  storage?: Storage;
  t: (key: string, vars?: Record<string, string>) => string;
}

function useEngramQueries(id: string) {
  const getQuery = useQuery({
    queryKey: ['cerebrum', 'engrams', 'get', { id }],
    queryFn: async () => unwrap(await engramsGet({ path: { id } })),
    retry: false,
  });
  const engram = getQuery.data?.engram ?? null;
  const body = getQuery.data?.body ?? '';
  const linkIds = useMemo(() => engram?.links ?? [], [engram]);
  const connectedInput = { ids: linkIds, limit: linkIds.length || 1 };
  const connectedQuery = useQuery({
    queryKey: ['cerebrum', 'engrams', 'list', connectedInput],
    queryFn: async () => unwrap(await engramsList({ body: connectedInput })),
    enabled: linkIds.length > 0,
  });
  return { getQuery, engram, body, connectedQuery };
}

export function useEngramDetailModel(options: UseEngramDetailOptions): EngramDetailModel {
  const { id, storage, t } = options;
  const queryClient = useQueryClient();
  const { getQuery, engram, body, connectedQuery } = useEngramQueries(id);
  const formState = useEngramFormState({ engram, body, storage });

  const updateMutation = useMutation({
    mutationFn: async ({ id: engramId, ...patch }: EngramUpdateInput) =>
      unwrap(await engramsUpdate({ path: { id: engramId }, body: patch })),
    onSuccess: async () => {
      if (engram) clearDraft(engram.id, storage);
      formState.finishEditing();
      await queryClient.invalidateQueries({ queryKey: ['cerebrum', 'engrams'] });
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
    error: resolveError(getQuery.error, t),
    notFound: isNotFoundError(getQuery.error),
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
    saveError: resolveError(updateMutation.error, t),
    save,
    draftRestored: formState.draftRestored,
    discardDraft: formState.discardDraft,
  };
}
