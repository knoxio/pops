/**
 * @pops/navigation
 *
 * Shared navigation and search-panel utilities accessible to both
 * the shell and all app packages.
 */
export {
  registerResultComponent,
  getResultComponent,
  GenericResultComponent,
  _clearRegistry,
} from "./result-component-registry";
export type { ResultComponent, ResultComponentProps } from "./result-component-registry";

export { AppContextProvider } from "./AppContextProvider";
export { useAppContext, useSetPageContext, useCurrentApp, useCurrentEntity } from "./hooks";
export type { SetPageContextOptions } from "./hooks";
export type { AppContext, AppContextEntity, AppName } from "./types";
export { DEFAULT_APP_CONTEXT } from "./types";

export { useRecentSearches } from "./recent-searches";
export { RecentSearches } from "./RecentSearches";
export { useSearchKeyboardNav } from "./search-keyboard-nav";
