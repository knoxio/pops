import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. search input keystrokes) so the
 * downstream query doesn't refetch on every character.
 */
export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
