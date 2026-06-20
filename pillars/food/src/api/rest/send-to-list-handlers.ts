/**
 * Handlers for the `sendToList.*` sub-router. The lists client is resolved
 * lazily (real HTTP client built from POPS_PILLARS, or an injected stub in
 * tests) so non-send-to-list requests never touch the lists registry.
 */
import { type ListsClient } from '../modules/recipes/send-to-list/lists-client.js';
import { prepareSendToList } from '../modules/recipes/send-to-list/prepare.js';
import { sendToList } from '../modules/recipes/send-to-list/send.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodSendToListContract } from '../../contract/rest-send-to-list.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodSendToListContract>;

export function makeSendToListHandlers(db: FoodDb, resolveClient: () => ListsClient) {
  return {
    prepare: ({ params, query }: Req['prepare']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await prepareSendToList(db, resolveClient(), params.versionId, query.scaleFactor),
      })),

    send: ({ params, body }: Req['send']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await sendToList(db, resolveClient(), {
          versionId: params.versionId,
          scaleFactor: body.scaleFactor,
          target: body.target,
        }),
      })),
  };
}
