/**
 * @pops/navigation
 *
 * Shared navigation and search-panel utilities accessible to both
 * the shell and all app packages.
 */
export { AppContextProvider } from './AppContextProvider';
export type { SetPageContextOptions } from './hooks';
export {
  useAppContext,
  useCurrentApp,
  useCurrentEntity,
  useSearchResultNavigation,
  useSetPageContext,
} from './hooks';
export { useRecentSearches } from './recent-searches';
export { RecentSearches } from './RecentSearches';
export type { ResultComponent, ResultComponentProps } from './result-component-registry';
export {
  _clearRegistry,
  GenericResultComponent,
  getResultComponent,
  registerResultComponent,
} from './result-component-registry';
export { useSearchKeyboardNav } from './search-keyboard-nav';
export type {
  SearchResultHit,
  SearchResultSection,
  SearchResultsPanelProps,
} from './SearchResultsPanel';
export { SearchResultsPanel } from './SearchResultsPanel';
export type { AppContext, AppContextEntity, AppName } from './types';
export { DEFAULT_APP_CONTEXT } from './types';
export { resolveUri } from './uri-resolver';
