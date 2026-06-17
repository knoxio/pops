/**
 * Database helpers for the Plexus lifecycle manager (PRD-090, PRD-180 US-03).
 *
 * Lifted from the pops-api monolith during the cerebrum REST migration. The
 * monolith resolved the drizzle handle per-call via `getCerebrumDrizzle()`
 * (AsyncLocalStorage); the pillar instead threads an explicit `CerebrumDb`
 * handle through — every helper takes it as its first argument, mirroring the
 * `plexusService.*` db-arg convention. All access delegates to the in-pillar
 * `plexusService` namespace.
 */
import {
  plexusService,
  type CerebrumDb,
  type PlexusAdapter,
  type PlexusFilter,
} from '../../../db/index.js';

import type { AdapterStatusValue, FilterDefinition, FilterRule } from './types.js';

export function updateAdapterStatus(
  db: CerebrumDb,
  adapterId: string,
  status: AdapterStatusValue,
  error?: string
): void {
  plexusService.updateAdapterStatus(db, adapterId, {
    status,
    updatedAt: new Date().toISOString(),
    lastError: error ?? null,
  });
}

export function updateAdapterLastHealth(db: CerebrumDb, adapterId: string): void {
  plexusService.recordAdapterHealth(db, adapterId, new Date().toISOString());
}

export function getAdapterRow(db: CerebrumDb, adapterId: string): PlexusAdapter {
  return plexusService.getAdapterOrThrow(db, adapterId);
}

export function deleteAdapter(db: CerebrumDb, adapterId: string): boolean {
  return plexusService.deleteAdapter(db, adapterId) > 0;
}

export function incrementIngestedCount(db: CerebrumDb, adapterId: string, count: number): void {
  plexusService.incrementAdapterCounter(db, adapterId, {
    counter: 'ingestedCount',
    delta: count,
    updatedAt: new Date().toISOString(),
  });
}

export function getEnabledFilterRows(db: CerebrumDb, adapterId: string): FilterRule[] {
  return plexusService.listEnabledFilters(db, adapterId).map(filterToRule);
}

export function syncFilterRows(
  db: CerebrumDb,
  adapterId: string,
  filters: FilterDefinition[]
): void {
  plexusService.setFilters(db, adapterId, filters);
}

function filterToRule(filter: PlexusFilter): FilterRule {
  return {
    filterType: filter.filterType,
    field: filter.field,
    pattern: filter.pattern,
    enabled: filter.enabled,
  };
}
