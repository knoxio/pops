/**
 * Database helpers for the Plexus lifecycle manager (PRD-090, PRD-180 US-03).
 *
 * Post-cutover: every helper resolves `getCerebrumDrizzle()` and delegates to
 * the `@pops/cerebrum-db` `plexusService` namespace. The reads stay on the
 * pillar handle (paired with the PRD-180 PR2 read cut) and the writes now
 * land there too — closing the previous split where reads went through
 * `cerebrum.db` while writes still hit the shared `pops.db`.
 *
 * The TOML loader, the per-adapter HTTP clients (Notion / Linear / IMAP /
 * etc.), and the envelope encryption of the `config` blob stay in
 * `apps/pops-api/src/modules/cerebrum/plexus/*` — they are domain
 * orchestration / IO, not data-access.
 */
import { plexusService, type PlexusAdapter, type PlexusFilter } from '@pops/cerebrum-db';

import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';

import type { AdapterStatusValue, FilterDefinition, FilterRule } from './types.js';

export function upsertAdapterRow(
  adapterId: string,
  name: string,
  settings: Record<string, unknown>,
  now: string
): PlexusAdapter {
  return plexusService.upsertAdapter(getCerebrumDrizzle(), {
    id: adapterId,
    name,
    config: settings,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateAdapterStatus(
  adapterId: string,
  status: AdapterStatusValue,
  error?: string
): void {
  plexusService.updateAdapterStatus(getCerebrumDrizzle(), adapterId, {
    status,
    updatedAt: new Date().toISOString(),
    lastError: error ?? null,
  });
}

export function updateAdapterLastHealth(adapterId: string): void {
  plexusService.recordAdapterHealth(getCerebrumDrizzle(), adapterId, new Date().toISOString());
}

export function getAdapterRow(adapterId: string): PlexusAdapter {
  return plexusService.getAdapterOrThrow(getCerebrumDrizzle(), adapterId);
}

export function deleteAdapter(adapterId: string): boolean {
  return plexusService.deleteAdapter(getCerebrumDrizzle(), adapterId) > 0;
}

export function incrementIngestedCount(adapterId: string, count: number): void {
  plexusService.incrementAdapterCounter(getCerebrumDrizzle(), adapterId, {
    counter: 'ingestedCount',
    delta: count,
    updatedAt: new Date().toISOString(),
  });
}

export function getEnabledFilterRows(adapterId: string): FilterRule[] {
  return plexusService.listEnabledFilters(getCerebrumDrizzle(), adapterId).map(filterToRule);
}

export function syncFilterRows(adapterId: string, filters: FilterDefinition[]): void {
  plexusService.setFilters(getCerebrumDrizzle(), adapterId, filters);
}

function filterToRule(filter: PlexusFilter): FilterRule {
  return {
    filterType: filter.filterType,
    field: filter.field,
    pattern: filter.pattern,
    enabled: filter.enabled,
  };
}
