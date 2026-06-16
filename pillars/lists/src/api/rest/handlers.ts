/**
 * ts-rest handler composer for the lists pillar.
 *
 * Stitches the per-section handler factories (`makeListHandlers`,
 * `makeItemsHandlers`) into the typed `RouterImplementation<ListsContract>`
 * shape that `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { listsContract } from '../../contract/rest.js';
import { makeItemsHandlers } from './items-handlers.js';
import { makeListHandlers } from './list-handlers.js';

import type { OpenedListsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeListsRestHandlers(deps: {
  listsDb: OpenedListsDb;
}): ReturnType<typeof server.router<typeof listsContract>> {
  return server.router(listsContract, {
    list: makeListHandlers(deps.listsDb.db),
    items: makeItemsHandlers(deps.listsDb.db),
  });
}
