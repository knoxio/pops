import { useUIStore } from '@/store/uiStore';
import { useEffect } from 'react';

/**
 * Close tablet overlay on navigation, unless AppRail requested we skip one
 * cycle (it sets skipNextPageNavClose before calling navigate so the overlay
 * it is about to open is not immediately collapsed by this effect).
 *
 * We read the flag imperatively so it's not a reactive dep — subscribing would
 * cause the effect to fire twice (once to skip/clear the flag, again when the
 * flag resets to false, which would then close the nav we just opened).
 */
export function usePageNavAutoClose(pathname: string, setPageNavOpen: (open: boolean) => void) {
  useEffect(() => {
    if (useUIStore.getState().skipNextPageNavClose) {
      useUIStore.getState().setSkipNextPageNavClose(false);
      return;
    }
    setPageNavOpen(false);
  }, [pathname, setPageNavOpen]);
}
