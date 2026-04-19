import { useEffect, useState } from 'react';

/** Media query match for tablet range (md but not lg) */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    setIsTablet(mql.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsTablet(e.matches);
    };
    mql.addEventListener('change', handler);
    return () => {
      mql.removeEventListener('change', handler);
    };
  }, []);
  return isTablet;
}
