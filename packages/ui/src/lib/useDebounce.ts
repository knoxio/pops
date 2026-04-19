import { useCallback, useEffect, useRef, useState } from 'react';

/** Debounce a string value by `delay` ms. Returns the debounced copy. */
export function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Returns a debounced version of `fn` that only fires after `delay` ms of
 * inactivity. The returned callback is stable unless `delay` changes.
 * Always calls the latest version of `fn` (no stale closure).
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delay);
    },
    [delay]
  );
}
