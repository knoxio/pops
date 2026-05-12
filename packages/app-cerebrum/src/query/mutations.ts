/**
 * Mutation wrappers for the Query view model.
 *
 * `useAskMutation` consumes the SSE streaming endpoint
 * (`/api/cerebrum/query/stream`, PRD-082 issue #2596) and progressively
 * surfaces tokens / final citations through the supplied callbacks.
 * `useSaveDocumentMutation` is a thin wrapper around the existing tRPC
 * `cerebrum.emit.generate` mutation for "save as document".
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { extractMessage } from '../utils/errors';
import { streamQuery } from './query-stream-client';

import type { MutableRefObject } from 'react';

import type { ValidatedQueryRequest } from './form-mapping';
import type { QueryAnswer, QueryHistoryEntry } from './types';

export interface AskInvocation {
  request: ValidatedQueryRequest;
  historyId: string;
}

export interface SaveDocumentRequest {
  mode: 'report';
  query: string;
  scopes?: string[];
  includeSecret?: boolean;
}

export interface AskBindings {
  pending: AskInvocation | null;
  setAnswer: (next: QueryAnswer | null) => void;
  setError: (next: string | null) => void;
  updateStats: (id: string, result: QueryAnswer) => void;
  unknownErrorMessage: string;
}

export function entryToRequest(entry: QueryHistoryEntry): ValidatedQueryRequest {
  return {
    question: entry.question,
    ...(entry.scopes.length > 0 ? { scopes: entry.scopes } : {}),
    ...(entry.domains.length > 0 ? { domains: entry.domains } : {}),
    ...(entry.includeSecret ? { includeSecret: true } : {}),
  };
}

export function buildSaveRequest(request: ValidatedQueryRequest): SaveDocumentRequest {
  return {
    mode: 'report',
    query: request.question,
    ...(request.scopes && request.scopes.length > 0 ? { scopes: request.scopes } : {}),
    ...(request.includeSecret ? { includeSecret: true } : {}),
  };
}

export interface AskMutationHandle {
  /** Start streaming an ask request. */
  mutate: (request: ValidatedQueryRequest) => void;
  /** True while a stream is in-flight (between mutate() and the done/error event). */
  isPending: boolean;
}

function buildPartialAnswer(text: string): QueryAnswer {
  return { answer: text, sources: [], scopes: [], confidence: 'low' };
}

function buildFinalAnswer(done: {
  answer: string;
  sources: QueryAnswer['sources'];
  scopes: string[];
  confidence: QueryAnswer['confidence'];
}): QueryAnswer {
  return {
    answer: done.answer,
    sources: done.sources,
    scopes: done.scopes,
    confidence: done.confidence,
  };
}

interface StreamSink {
  bindings: AskBindings;
  pendingRef: MutableRefObject<AskInvocation | null>;
  abortRef: MutableRefObject<AbortController | null>;
  setIsPending: (next: boolean) => void;
  reportError: (message: string) => void;
}

/**
 * Build the SSE callback set the streaming client invokes. Extracted so
 * `useAskMutation` stays under the per-function line budget.
 */
function buildStreamCallbacks(sink: StreamSink): Parameters<typeof streamQuery>[1] {
  const { bindings, pendingRef, abortRef, setIsPending, reportError } = sink;
  const finish = (): void => {
    setIsPending(false);
    abortRef.current = null;
  };
  return {
    onToken: (cumulative) => bindings.setAnswer(buildPartialAnswer(cumulative)),
    onDone: (done) => {
      const finalAnswer = buildFinalAnswer(done);
      bindings.setAnswer(finalAnswer);
      bindings.setError(null);
      const pending = pendingRef.current;
      if (pending) bindings.updateStats(pending.historyId, finalAnswer);
      finish();
    },
    onError: (message) => {
      reportError(message);
      finish();
    },
  };
}

/**
 * Wire a streaming ask request into the page-level state setters.
 *
 * Tokens progressively grow the `answer.answer` field; once the `done`
 * event arrives, the citations + scopes + confidence are appended and
 * `pending` history stats are updated. Errors invoke `setError` and surface
 * a toast — same contract the tRPC version used to honour.
 */
export function useAskMutation(bindings: AskBindings): AskMutationHandle {
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<AskInvocation | null>(bindings.pending);
  // `bindings` is rebuilt every render; keep a ref so the streaming
  // callbacks always see the latest snapshot without re-binding the hook.
  pendingRef.current = bindings.pending;

  const reportError = useCallback(
    (message: string) => {
      bindings.setError(message);
      toast.error(message);
    },
    [bindings]
  );

  const mutate = useCallback(
    (request: ValidatedQueryRequest) => {
      if (isPending) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsPending(true);
      bindings.setError(null);
      bindings.setAnswer(null);

      const callbacks = buildStreamCallbacks({
        bindings,
        pendingRef,
        abortRef,
        setIsPending,
        reportError,
      });
      void streamQuery(request, callbacks, { signal: controller.signal }).catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        reportError(extractMessage(err, bindings.unknownErrorMessage));
        setIsPending(false);
        abortRef.current = null;
      });
    },
    [bindings, isPending, reportError]
  );

  return { mutate, isPending };
}

interface SaveResult {
  document?: { title?: string } | null;
  notice?: string;
}

export function useSaveDocumentMutation(unknownErrorMessage: string) {
  const { t } = useTranslation('cerebrum');
  return trpc.cerebrum.emit.generate.useMutation({
    onSuccess: (result: SaveResult | undefined) => {
      const title = result?.document?.title;
      if (title) {
        toast.success(t('query.saveDocument.success', { title }));
        return;
      }
      toast.success(result?.notice ?? t('query.saveDocument.empty'));
    },
    onError: (err: unknown) => toast.error(extractMessage(err, unknownErrorMessage)),
  });
}
