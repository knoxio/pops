/**
 * Engram public shapes returned from the data-access layer.
 *
 * Source of truth for an engram's full document form remains the
 * Markdown file on disk; this package owns only the index projection.
 * Keeping these types in the data package lets `cerebrum-api` (and any
 * other consumer) build views without re-deriving them from drizzle row
 * shapes.
 */

/** Frontmatter source — accepts the fixed channels plus `plexus:{name}`. */
export type EngramSource = 'manual' | 'agent' | 'moltbot' | 'cli' | `plexus:${string}`;

/** Lifecycle status from frontmatter. */
export type EngramStatus = 'active' | 'archived' | 'consolidated' | 'stale';

/**
 * An engram summary — all the index columns plus the materialised
 * scopes/tags/links. Equivalent to one `engram_index` row joined with its
 * many-to-many auxiliaries.
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

/**
 * The minimal subset of `engram_index` that detector-style scans need.
 * Returned by `loadActiveEngrams` — non-archived, non-consolidated rows
 * with their scopes and tags hydrated. Body is intentionally omitted; if
 * a consumer needs the body it should read the file via `filePath` from
 * a full `Engram` instead.
 */
export interface EngramSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  scopes: string[];
  tags: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface IndexRow {
  id: string;
  filePath: string;
  type: string;
  source: string;
  status: string;
  template: string | null;
  createdAt: string;
  modifiedAt: string;
  title: string;
  contentHash: string;
  bodyHash: string | null;
  wordCount: number;
  customFields: string | null;
}

export interface ListEngramsOptions {
  type?: string;
  scopes?: string[];
  tags?: string[];
  ids?: string[];
  status?: EngramStatus;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: {
    field: 'created_at' | 'modified_at' | 'title';
    direction: 'asc' | 'desc';
  };
}

export interface ListEngramsResult {
  engrams: Engram[];
  total: number;
}

/**
 * Inputs for `upsertEngramIndex` — the index row plus the scopes/tags/
 * links arrays the indexer derived from frontmatter. The caller is
 * expected to have already serialised any customFields they want stored
 * on the row.
 */
export interface UpsertEngramArgs {
  id: string;
  filePath: string;
  type: string;
  source: EngramSource;
  status: EngramStatus;
  template: string | null;
  createdAt: string;
  modifiedAt: string;
  title: string;
  contentHash: string;
  bodyHash: string | null;
  wordCount: number;
  customFields: Record<string, unknown>;
  scopes: readonly string[];
  tags: readonly string[];
  links: readonly string[];
}
