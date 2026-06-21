/**
 * Action callbacks for the Query page view model.
 *
 * Split from `useQueryPageModel` so the orchestrator hook stays within
 * the line/complexity caps. These callbacks own the form / pending /
 * answer state transitions; the mutations themselves live in
 * `mutations.ts`.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { queryErrorMessageKey, validateQueryForm } from './form-mapping';
import { buildHistoryEntry, type HistoryState } from './history-state';
import { buildSaveRequest, entryToRequest, type AskInvocation } from './mutations';

import type { QueryAnswer, QueryFormState, QueryHistoryEntry } from './types';

interface UseQueryActionsArgs {
  form: QueryFormState;
  setForm: (next: QueryFormState) => void;
  answer: QueryAnswer | null;
  pending: AskInvocation | null;
  setPending: (next: AskInvocation | null) => void;
  setError: (next: string | null) => void;
  history: HistoryState;
  askMutate: (request: AskInvocation['request']) => void;
  saveMutate: (request: ReturnType<typeof buildSaveRequest>) => void;
}

export interface QueryActions {
  onAsk: () => void;
  onRerun: (entry: QueryHistoryEntry) => void;
  onSaveAsDocument: () => void;
}

export function useQueryActions(args: UseQueryActionsArgs): QueryActions {
  const { t } = useTranslation('cerebrum');
  const { form, setForm, answer, pending, setPending, setError, history, askMutate, saveMutate } =
    args;

  const runAsk = useCallback(
    (invocation: AskInvocation) => {
      setError(null);
      setPending(invocation);
      askMutate(invocation.request);
    },
    [askMutate, setError, setPending]
  );

  const onAsk = useCallback(() => {
    const validated = validateQueryForm(form);
    if (!validated.ok) {
      toast.error(t(queryErrorMessageKey(validated.error)));
      return;
    }
    const entry = buildHistoryEntry(validated.request);
    history.addEntry(entry);
    runAsk({ request: validated.request, historyId: entry.id });
  }, [form, history, runAsk, t]);

  const onRerun = useCallback(
    (entry: QueryHistoryEntry) => {
      setForm({
        question: entry.question,
        scopes: entry.scopes.join(', '),
        domains: entry.domains,
        includeSecret: entry.includeSecret,
      });
      history.moveToTop(entry);
      runAsk({ request: entryToRequest(entry), historyId: entry.id });
    },
    [history, runAsk, setForm]
  );

  const onSaveAsDocument = useCallback(() => {
    if (!answer || !pending) return;
    saveMutate(buildSaveRequest(pending.request));
  }, [answer, pending, saveMutate]);

  return { onAsk, onRerun, onSaveAsDocument };
}
