/**
 * Plexus public shapes returned from the data-access layer.
 *
 * Consumers build adapter / filter views from these instead of
 * re-deriving them from drizzle row shapes.
 */

/** Lifecycle states a registered adapter cycles through. */
export const PLEXUS_ADAPTER_STATUSES = [
  'registered',
  'initializing',
  'healthy',
  'degraded',
  'error',
  'shutdown',
] as const;
export type PlexusAdapterStatus = (typeof PLEXUS_ADAPTER_STATUSES)[number];

/** Include / exclude — the two filter kinds the lifecycle manager honours. */
export const PLEXUS_FILTER_TYPES = ['include', 'exclude'] as const;
export type PlexusFilterType = (typeof PLEXUS_FILTER_TYPES)[number];

/**
 * Raw row shape as it sits on `plexus_adapters`. `config` is the encrypted
 * envelope blob the plexus router decrypts upstream — the data-access
 * layer never opens it.
 */
export interface PlexusAdapterRow {
  id: string;
  name: string;
  status: string;
  config: string | null;
  lastHealth: string | null;
  lastError: string | null;
  ingestedCount: number;
  emittedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Deserialised adapter shape — `config` parsed back to its JSON envelope. */
export interface PlexusAdapter {
  id: string;
  name: string;
  status: PlexusAdapterStatus;
  config: Record<string, unknown> | null;
  lastHealth: string | null;
  lastError: string | null;
  ingestedCount: number;
  emittedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Raw row shape on `plexus_filters`. `enabled` is an int (0|1). */
export interface PlexusFilterRow {
  id: string;
  adapterId: string;
  filterType: string;
  field: string;
  pattern: string;
  enabled: number;
}

/** Deserialised filter shape — `enabled` projected to a boolean. */
export interface PlexusFilter {
  id: string;
  adapterId: string;
  filterType: PlexusFilterType;
  field: string;
  pattern: string;
  enabled: boolean;
}

/**
 * Insert / set payload for a single filter — caller supplies the rule, the
 * service generates the surrogate id. `enabled` defaults to true when
 * omitted so TOML-loaded definitions can elide the field for the common
 * case.
 */
export interface PlexusFilterDefinition {
  filterType: PlexusFilterType;
  field: string;
  pattern: string;
  enabled?: boolean;
}

/**
 * Upsert payload for `upsertAdapter` — the data-access layer's contract
 * for registering / re-registering an adapter row. On conflict, status
 * resets to `registered`, `lastError` is cleared, and `config` +
 * `updatedAt` are overwritten. `createdAt` is only used on insert.
 */
export interface UpsertAdapterArgs {
  id: string;
  name: string;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
