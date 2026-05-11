/**
 * Public types for the Plexus admin surface (PRD-090, PRD-091).
 *
 * Mirror of the server-side `PlexusAdapter` / `PlexusFilter` shapes.
 */

export const PLEXUS_ADAPTER_STATUSES = [
  'registered',
  'initializing',
  'healthy',
  'degraded',
  'error',
  'shutdown',
] as const;
export type PlexusAdapterStatus = (typeof PLEXUS_ADAPTER_STATUSES)[number];

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

export type PlexusFilterType = 'include' | 'exclude';

export interface PlexusFilter {
  id: string;
  adapterId: string;
  filterType: PlexusFilterType;
  field: string;
  pattern: string;
  enabled: boolean;
}
