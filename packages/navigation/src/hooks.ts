import { useCallback, useContext, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router';

import { AppContextCtx } from './context.js';
import type { AppContext, AppContextEntity, AppName } from './types.js';
import { resolveUri } from './uri-resolver.js';

/**
 * Returns the current AppContext.
 *
 * Must be used inside an AppContextProvider.
 */
export function useAppContext(): AppContext {
  return useContext(AppContextCtx).context;
}

/** Options accepted by useSetPageContext. */
export interface SetPageContextOptions {
  page: string;
  pageType?: AppContext['pageType'];
  entity?: AppContextEntity;
  filters?: Record<string, string>;
}

/**
 * Sets page-level context on mount and clears it on unmount.
 *
 * Call this from any page component to register its identity with the
 * global AppContext. The provider automatically clears on navigation,
 * and this hook also clears on unmount for safety.
 */
export function useSetPageContext(options: SetPageContextOptions): void {
  const { setPageContext } = useContext(AppContextCtx);

  useLayoutEffect(() => {
    setPageContext({
      page: options.page,
      pageType: options.pageType ?? 'top-level',
      entity: options.entity,
      filters: options.filters,
    });

    return () => {
      setPageContext({ page: null, pageType: 'top-level', entity: undefined, filters: undefined });
    };
    // Re-run when any option value changes
  }, [options.page, options.pageType, options.entity, options.filters, setPageContext]);
}

/** Returns the active app identifier, or null at root / unmatched paths. */
export function useCurrentApp(): AppName | null {
  return useAppContext().app;
}

/** Returns the entity being viewed on a drill-down page, or null otherwise. */
export function useCurrentEntity(): AppContextEntity | null {
  const { pageType, entity } = useAppContext();
  return pageType === 'drill-down' && entity ? entity : null;
}

/**
 * Returns a navigateTo callback that resolves a POPS URI and navigates to
 * the corresponding frontend route.
 *
 * @returns `navigateTo(uri)` — returns true if navigation succeeded, false if
 * the URI could not be resolved.
 */
export function useSearchResultNavigation(): {
  navigateTo: (uri: string) => boolean;
} {
  const navigate = useNavigate();

  const navigateTo = useCallback(
    (uri: string): boolean => {
      const route = resolveUri(uri);
      if (!route) return false;
      navigate(route);
      return true;
    },
    [navigate]
  );

  return { navigateTo };
}
