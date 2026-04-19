import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

/**
 * Debounced search input bound one-way to the `?q=` URL param.
 *
 * The input value is seeded once from `?q=` on mount, then debounced (default
 * 300ms) and written back to the URL via `setSearchParams({ replace: true })`
 * so the input owns the canonical value during the session. URL changes that
 * happen *after* mount (browser back/forward, external nav) are intentionally
 * not synced back into local state — the input is the source of truth while
 * the page is mounted.
 */
export function useSearchQueryParam(debounceMs = 300) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedQuery) {
          next.set('q', debouncedQuery);
        } else {
          next.delete('q');
        }
        return next;
      },
      { replace: true }
    );
  }, [debouncedQuery, setSearchParams]);

  return { query, setQuery, debouncedQuery };
}
