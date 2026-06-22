/**
 * ts-rest handler composer for the core pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<CoreRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`. Grows as each tRPC slice converts to ts-rest.
 */
import { initServer } from '@ts-rest/express';

import { coreContract } from '../../contract/rest.js';
import { type OpenedCoreDb } from '../../db/index.js';
import { makeFeaturesHandlers } from './features-handlers.js';
import { makeServiceAccountsHandlers } from './service-accounts-handlers.js';
import { makeSettingsHandlers } from './settings-handlers.js';
import { makeShellHandlers } from './shell-handlers.js';
import { makeUsersHandlers } from './users-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeCoreRestHandlers(deps: {
  coreDb: OpenedCoreDb;
}): ReturnType<typeof server.router<typeof coreContract>> {
  const db = deps.coreDb.db;
  return server.router(coreContract, {
    features: makeFeaturesHandlers(db),
    serviceAccounts: makeServiceAccountsHandlers(db),
    settings: makeSettingsHandlers(db),
    shell: makeShellHandlers(),
    users: makeUsersHandlers(db),
  });
}
