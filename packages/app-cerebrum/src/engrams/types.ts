/**
 * Public types for the Engrams browser surface.
 *
 * These mirror the server-side `Engram` shape returned by
 * `cerebrum.engrams.list` / `.get`. Re-declaring them here (rather than
 * importing from the API package) keeps the cerebrum frontend package
 * boundary clean per PRD-097 — frontend packages must not import from
 * the API source tree.
 */

export const ENGRAM_STATUSES = ['active', 'archived', 'consolidated', 'stale'] as const;
export type EngramStatus = (typeof ENGRAM_STATUSES)[number];

/** Engram source channels. Custom plexus sources arrive as `plexus:{name}`. */
export const ENGRAM_SOURCES = ['manual', 'agent', 'moltbot', 'cli'] as const;
export type EngramSourceFixed = (typeof ENGRAM_SOURCES)[number];
export type EngramSource = EngramSourceFixed | `plexus:${string}`;

/**
 * An engram summary as returned from `cerebrum.engrams.list`. The detail
 * view augments this with the body string from `cerebrum.engrams.get`.
 */
export interface Engram {
  id: string;
  type: string;
  scopes: string[];
  tags: string[];
  links: string[];
  created: string;
  modified: string;
  source: EngramSource;
  status: EngramStatus;
  template: string | null;
  title: string;
  filePath: string;
  contentHash: string;
  wordCount: number;
  customFields: Record<string, unknown>;
}

/** Filter state for the list/search view. Empty arrays/strings mean "no filter". */
export interface EngramListFilters {
  search: string;
  scope: string | null;
  source: string | null;
  tag: string | null;
  status: EngramStatus | null;
}

export const DEFAULT_ENGRAM_FILTERS: EngramListFilters = {
  search: '',
  scope: null,
  source: null,
  tag: null,
  status: null,
};

/**
 * Local draft for the edit view, persisted to `localStorage`.
 *
 * Drafts are scoped per-engram by ID. A non-null draft means the user
 * has unsaved changes that should be restored when they re-open the
 * edit view.
 */
export interface EngramDraft {
  id: string;
  title: string;
  body: string;
  scopes: string[];
  tags: string[];
  status: EngramStatus;
  /** ISO timestamp of last keystroke, used to detect stale drafts. */
  updatedAt: string;
  /** Hash of the engram at the moment the draft was first started. */
  baseContentHash: string;
}
