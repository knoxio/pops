import {
  type InventoryDb,
  LocationCycleError,
  LocationNotFoundError,
  locationsService,
  LocationSelfParentError,
  ParentLocationNotFoundError,
} from '../../db/index.js';
import { toLocation } from '../modules/locations/types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryLocationsContract } from '../../contract/rest-locations.js';

type Req = ServerInferRequest<typeof inventoryLocationsContract>;

function translateLocationError(err: unknown): never {
  if (err instanceof LocationNotFoundError) throw new NotFoundError('Location', err.id);
  if (err instanceof ParentLocationNotFoundError)
    throw new NotFoundError('Parent location', err.id);
  if (err instanceof LocationCycleError) {
    throw new ConflictError('Moving this location would create a circular reference');
  }
  if (err instanceof LocationSelfParentError) {
    throw new ConflictError('A location cannot be its own parent');
  }
  throw err;
}

/**
 * Handlers for the `locations.*` sub-router. `translateLocationError`
 * maps db domain errors (LocationNotFoundError, LocationCycleError, …)
 * to shared HttpError subclasses so `runHttp` yields 404/409.
 */
export function makeLocationsHandlers(db: InventoryDb) {
  return {
    list: () =>
      runHttp(() => {
        const { rows, total } = locationsService.listLocations(db);
        return { status: 200 as const, body: { data: rows.map(toLocation), total } };
      }),

    tree: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: locationsService.getLocationTree(db) },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: toLocation(locationsService.getLocation(db, params.id)) },
          };
        } catch (err) {
          translateLocationError(err);
        }
      }),

    getPath: ({ params }: Req['getPath']) =>
      runHttp(() => {
        try {
          const rows = locationsService.getLocationPath(db, params.id);
          return { status: 200 as const, body: { data: rows.map(toLocation) } };
        } catch (err) {
          translateLocationError(err);
        }
      }),

    children: ({ params }: Req['children']) =>
      runHttp(() => {
        const rows = locationsService.getChildren(db, params.id);
        return { status: 200 as const, body: { data: rows.map(toLocation) } };
      }),

    deleteStats: ({ params }: Req['deleteStats']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: locationsService.getDeleteStats(db, params.id) },
          };
        } catch (err) {
          translateLocationError(err);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = locationsService.createLocation(db, body);
          return {
            status: 201 as const,
            body: { data: toLocation(row), message: 'Location created' },
          };
        } catch (err) {
          translateLocationError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = locationsService.updateLocation(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toLocation(row), message: 'Location updated' },
          };
        } catch (err) {
          translateLocationError(err);
        }
      }),

    delete: ({ params, query }: Req['delete']) =>
      runHttp(() => {
        try {
          if (query.force !== true) {
            const stats = locationsService.getDeleteStats(db, params.id);
            if (stats.childCount > 0 || stats.itemCount > 0) {
              return { status: 200 as const, body: { requiresConfirmation: true as const, stats } };
            }
          }
          locationsService.deleteLocation(db, params.id);
          return { status: 200 as const, body: { message: 'Location deleted' } };
        } catch (err) {
          translateLocationError(err);
        }
      }),
  };
}
