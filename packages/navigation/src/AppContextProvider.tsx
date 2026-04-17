import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { AppContextCtx } from './context.js';
import { DEFAULT_APP_CONTEXT } from './types.js';

import type { AppContext, AppName } from './types.js';

/** Maps URL base paths to their app identifiers. */
const APP_BASE_PATHS: Array<{ basePath: string; app: AppName }> = [
  { basePath: '/finance', app: 'finance' },
  { basePath: '/media', app: 'media' },
  { basePath: '/inventory', app: 'inventory' },
  { basePath: '/ai', app: 'ai' },
];

/**
 * Detect the active app from a URL pathname.
 *
 * Matches at a path-segment boundary to avoid false positives
 * (e.g. /finances should not match /finance).
 */
function detectApp(pathname: string): AppName | null {
  for (const { basePath, app } of APP_BASE_PATHS) {
    if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
      return app;
    }
  }
  return null;
}

interface AppContextProviderProps {
  children: ReactNode;
}

/**
 * AppContextProvider — wraps the app and tracks the active context.
 *
 * - Detects the active app from the URL path (listens to react-router navigation).
 * - Resets page-level context (page, pageType, entity, filters) on each navigation.
 * - Exposes context via useAppContext().
 *
 * Must be rendered inside a react-router Router (e.g. inside RouterProvider or
 * a MemoryRouter in tests), since it relies on useLocation().
 */
export function AppContextProvider({ children }: AppContextProviderProps) {
  const { pathname } = useLocation();

  const [pageContext, setPageContextState] = useState<
    Partial<Pick<AppContext, 'page' | 'pageType' | 'entity' | 'filters'>>
  >({});

  // Reset page-level context when the user navigates to a new path.
  // Skip on initial mount — child useLayoutEffect (useSetPageContext) fires before parent
  // and would be overwritten if we reset unconditionally on every pathname value.
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setPageContextState({});
  }, [pathname]);

  const context = useMemo<AppContext>(
    () => ({
      ...DEFAULT_APP_CONTEXT,
      ...pageContext,
      app: detectApp(pathname),
    }),
    [pathname, pageContext]
  );

  const setPageContext = useCallback(
    (partial: Partial<Pick<AppContext, 'page' | 'pageType' | 'entity' | 'filters'>>) => {
      setPageContextState((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const value = useMemo(() => ({ context, setPageContext }), [context, setPageContext]);

  return <AppContextCtx.Provider value={value}>{children}</AppContextCtx.Provider>;
}
