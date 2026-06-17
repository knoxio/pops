/**
 * Public types for the Engrams browser surface.
 *
 * The `Engram` shape is projected directly from the generated cerebrum
 * REST client (`src/cerebrum-api/`) so the FE stays in lockstep with the
 * pillar's wire contract. Filter/draft types stay hand-authored.
 */
import type { EngramsListResponses } from '../cerebrum-api/types.gen.js';

export const ENGRAM_STATUSES = ['active', 'archived', 'consolidated', 'stale'] as const;
export type EngramStatus = (typeof ENGRAM_STATUSES)[number];

/** Engram source channels. Custom plexus sources arrive as `plexus:{name}`. */
export const ENGRAM_SOURCES = ['manual', 'agent', 'moltbot', 'cli'] as const;
export type EngramSourceFixed = (typeof ENGRAM_SOURCES)[number];
export type EngramSource = EngramSourceFixed | `plexus:${string}`;

/**
 * An engram summary as returned from `POST /engrams/search`. The detail
 * view augments this with the body string from `GET /engrams/{id}`.
 */
export type Engram = EngramsListResponses[200]['engrams'][number];

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
