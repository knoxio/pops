/**
 * View model for the Query page (`/cerebrum/query`, PRD-082).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useHistoryState } from './history-state';
import { useAskMutation, useSaveDocumentMutation, type AskInvocation } from './mutations';
import {
  DEFAULT_QUERY_FORM,
  type QueryAnswer,
  type QueryFormState,
  type QueryHistoryEntry,
} from './types';
import { useQueryActions } from './useQueryActions';

export interface QueryPageModel {
  form: QueryFormState;
  setForm: (next: QueryFormState) => void;
  answer: QueryAnswer | null;
  isAsking: boolean;
  isSavingDocument: boolean;
  error: string | null;
  history: QueryHistoryEntry[];
  onAsk: () => void;
  onRerun: (entry: QueryHistoryEntry) => void;
  onRemoveHistory: (id: string) => void;
  onSaveAsDocument: () => void;
  /** History row id for the most recent ask — used to highlight the active row. */
  lastSubmittedId: string | null;
}

export function useQueryPageModel(): QueryPageModel {
  const { t } = useTranslation('cerebrum');
  const unknownErrorMessage = t('errors.unknown');

  const [form, setForm] = useState<QueryFormState>(DEFAULT_QUERY_FORM);
  const [answer, setAnswer] = useState<QueryAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AskInvocation | null>(null);
  const historyState = useHistoryState();

  const askMutation = useAskMutation({
    pending,
    setAnswer,
    setError,
    updateStats: historyState.updateStats,
    unknownErrorMessage,
  });
  const saveDocumentMutation = useSaveDocumentMutation(unknownErrorMessage);

  const actions = useQueryActions({
    form,
    setForm,
    answer,
    pending,
    setPending,
    setError,
    history: historyState,
    askMutate: askMutation.mutate,
    saveMutate: saveDocumentMutation.mutate,
  });

  return useMemo<QueryPageModel>(
    () => ({
      form,
      setForm,
      answer,
      isAsking: askMutation.isPending,
      isSavingDocument: saveDocumentMutation.isPending,
      error,
      history: historyState.history,
      onAsk: actions.onAsk,
      onRerun: actions.onRerun,
      onRemoveHistory: historyState.remove,
      onSaveAsDocument: actions.onSaveAsDocument,
      lastSubmittedId: pending?.historyId ?? null,
    }),
    [
      form,
      answer,
      askMutation.isPending,
      saveDocumentMutation.isPending,
      error,
      historyState,
      actions,
      pending,
    ]
  );
}
