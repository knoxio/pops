/**
 * Shared type definitions for app context and navigation.
 *
 * Lives in @pops/navigation so shell, app packages, and @pops/ui can all
 * import from here without creating circular dependencies.
 */

/** Known app identifiers. */
export type AppName = "finance" | "media" | "inventory" | "ai";

/** An entity the user is currently viewing (e.g. a specific movie or transaction). */
export interface AppContextEntity {
  /** Namespaced URI, e.g. "pops:media/movie/42". */
  uri: string;
  /** Entity type, e.g. "movie", "transaction". */
  type: string;
  /** Human-readable title, e.g. "Fight Club". */
  title: string;
}

/**
 * The current contextual state of the shell — which app is active,
 * which page, what entity (if any) is being viewed, and what filters
 * are applied.
 */
export interface AppContext {
  /** Active app, or null at root / or unmatched paths. */
  app: AppName | null;
  /** Current page identifier set by the active page component, or null. */
  page: string | null;
  /** Whether the current page is a top-level list/dashboard or a drill-down detail view. */
  pageType: "top-level" | "drill-down";
  /** Set when the user is viewing a specific entity. Cleared on navigation. */
  entity?: AppContextEntity;
  /** Active filter state on list pages. Cleared on navigation. */
  filters?: Record<string, string>;
}

/** The default context returned when no app is matched (e.g. root /). */
export const DEFAULT_APP_CONTEXT: AppContext = {
  app: null,
  page: null,
  pageType: "top-level",
};
