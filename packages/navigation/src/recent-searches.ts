/**
 * useRecentSearches — hook for managing recent search queries in localStorage.
 *
 * Stores up to MAX_RECENT queries (deduped, most-recent-first).
 */
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'pops:recent-searches';
const MAX_RECENT = 10;

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function writeToStorage(queries: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

export function useRecentSearches() {
  const [queries, setQueries] = useState<string[]>(readFromStorage);

  const addQuery = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setQueries((prev) => {
      const deduped = prev.filter((q) => q !== trimmed);
      const next = [trimmed, ...deduped].slice(0, MAX_RECENT);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setQueries([]);
  }, []);

  return { queries, addQuery, clearAll } as const;
}
