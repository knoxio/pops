import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. search input keystrokes) so the
 * downstream React Query doesn't refetch on every character. 200 ms is
 * the PRD-119 spec.
 */
export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
