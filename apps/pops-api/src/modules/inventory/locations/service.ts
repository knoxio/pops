/**
 * Thin forwarders to `@pops/inventory-db`'s `locationsService` namespace.
 *
 * Each function resolves the pops-api shared drizzle handle via
 * `getDrizzle()` and passes it to the package. Typed errors thrown by
 * the package are translated to the `NotFoundError` / `ConflictError`
 * variants the rest of pops-api still expects, so the global error
 * handler keeps producing the same status codes and i18n keys.
 *
 * PR 4 of the inventory pillar Phase 1 deletes this shim and flips
 * `router.ts` + `items/service.ts` to import from `@pops/inventory-db`
 * directly.
 */
import {
  LocationCycleError,
  LocationNotFoundError,
  LocationSelfParentError,
  ParentLocationNotFoundError,
  locationsService,
} from '@pops/inventory-db';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type {
  CreateLocationInput,
  DeleteLocationStats,
  LocationItemsResult,
  LocationListResult,
  LocationRow,
  LocationTreeNode,
  UpdateLocationInput,
} from './types.js';

export type { DeleteLocationStats, LocationItemsResult };

function translateLocationError(err: unknown): never {
  if (err instanceof LocationNotFoundError) {
    throw new NotFoundError('Location', err.id);
  }
  if (err instanceof ParentLocationNotFoundError) {
    throw new NotFoundError('Parent location', err.id);
  }
  if (err instanceof LocationCycleError) {
    throw new ConflictError('Moving this location would create a circular reference');
  }
  if (err instanceof LocationSelfParentError) {
    throw new ConflictError('A location cannot be its own parent');
  }
  throw err;
}

function translateErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    translateLocationError(err);
  }
}

export function getDescendantLocationIds(id: string): string[] {
  return locationsService.getDescendantLocationIds(getDrizzle(), id);
}

export function listLocations(): LocationListResult {
  return locationsService.listLocations(getDrizzle());
}

export function getLocation(id: string): LocationRow {
  return translateErrors(() => locationsService.getLocation(getDrizzle(), id));
}

export function getLocationTree(): LocationTreeNode[] {
  return locationsService.getLocationTree(getDrizzle());
}

export function getChildren(parentId: string): LocationRow[] {
  return locationsService.getChildren(getDrizzle(), parentId);
}

export function getLocationPath(id: string): LocationRow[] {
  return translateErrors(() => locationsService.getLocationPath(getDrizzle(), id));
}

export function getLocationItems(
  locationId: string,
  includeChildren: boolean,
  limit: number,
  offset: number
): LocationItemsResult {
  return translateErrors(() =>
    locationsService.getLocationItems(getDrizzle(), {
      locationId,
      includeChildren,
      limit,
      offset,
    })
  );
}

export function getDeleteStats(id: string): DeleteLocationStats {
  return translateErrors(() => locationsService.getDeleteStats(getDrizzle(), id));
}

export function createLocation(input: CreateLocationInput): LocationRow {
  return translateErrors(() => locationsService.createLocation(getDrizzle(), input));
}

export function updateLocation(id: string, input: UpdateLocationInput): LocationRow {
  return translateErrors(() => locationsService.updateLocation(getDrizzle(), id, input));
}

export function deleteLocation(id: string): void {
  translateErrors(() => {
    locationsService.deleteLocation(getDrizzle(), id);
  });
}
