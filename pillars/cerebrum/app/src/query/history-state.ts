/**
 * History state hook + helpers for the Query view model.
 *
 * Split out of `useQueryPageModel` so each surface (hook, page) stays
 * within the line/complexity caps and so the history mutations stay
 * unit-testable in isolation.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  appendHistoryEntry,
  readQueryHistory,
  removeHistoryEntry,
  writeQueryHistory,
} from './history-storage';

import type { QueryAnswer, QueryHistoryEntry } from './types';

/**
 * Collision-resistant id for history rows. `updateStats` / `remove`
 * key off this id, so a same-millisecond duplicate would mutate or
 * delete the wrong row.
 */
function generateHistoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface HistoryState {
  history: QueryHistoryEntry[];
  addEntry: (entry: QueryHistoryEntry) => void;
  moveToTop: (entry: QueryHistoryEntry) => void;
  remove: (id: string) => void;
  updateStats: (id: string, result: QueryAnswer) => void;
}

export function buildHistoryEntry(input: {
  question: string;
  scopes?: string[];
  domains?: QueryHistoryEntry['domains'];
  includeSecret?: boolean;
}): QueryHistoryEntry {
  return {
    id: generateHistoryId(),
    submittedAt: new Date().toISOString(),
    question: input.question,
    scopes: input.scopes ?? [],
    domains: input.domains ?? [],
    includeSecret: input.includeSecret ?? false,
    lastConfidence: null,
    lastSourceCount: 0,
  };
}

export function useHistoryState(): HistoryState {
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => readQueryHistory());
  useEffect(() => {
    writeQueryHistory(history);
  }, [history]);

  const updateStats = useCallback((id: string, result: QueryAnswer) => {
    setHistory((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, lastConfidence: result.confidence, lastSourceCount: result.sources.length }
          : entry
      )
    );
  }, []);

  const addEntry = useCallback((entry: QueryHistoryEntry) => {
    setHistory((prev) => appendHistoryEntry(prev, entry));
  }, []);

  const moveToTop = useCallback((entry: QueryHistoryEntry) => {
    setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
  }, []);

  const remove = useCallback((id: string) => {
    setHistory((prev) => removeHistoryEntry(prev, id));
  }, []);

  return { history, addEntry, moveToTop, remove, updateStats };
}
