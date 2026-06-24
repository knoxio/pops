/**
 * `matchMedia` hook that flips the planning surface to its mobile layout at
 * the `MOBILE_QUERY` breakpoint. Returns `false` in non-browser environments
 * so SSR and unit tests render the grid by default; tests that want the
 * mobile view stub `window.matchMedia`.
 */
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

function matches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const listener = (event: MediaQueryListEvent): void => setIsMobile(event.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);
  return isMobile;
}
