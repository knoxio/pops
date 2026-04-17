import { createContext } from 'react';

import { DEFAULT_APP_CONTEXT } from './types.js';

import type { AppContext } from './types.js';

/**
 * Internal context value shape.
 *
 * setPageContext is intentionally not exported from the public API in US-01;
 * it will be consumed by useSetPageContext in US-02.
 */
export interface AppContextValue {
  context: AppContext;
  /** Update page-level fields (page, pageType, entity, filters). Called by pages on mount. */
  setPageContext: (
    partial: Partial<Pick<AppContext, 'page' | 'pageType' | 'entity' | 'filters'>>
  ) => void;
}

export const AppContextCtx = createContext<AppContextValue>({
  context: DEFAULT_APP_CONTEXT,
  setPageContext: () => {},
});

AppContextCtx.displayName = 'AppContext';
