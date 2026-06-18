/**
 * Handlers for the `ai-providers.*` sub-router.
 *
 * Thin wrappers over the existing `ai-providers/service.ts`. `get` preserves
 * the nullable contract (unknown id → `null` body, not 404). `healthCheck`
 * is async (it does a live `fetch` against the provider) and resolves to the
 * persisted `{ status, latencyMs, error? }`. Wire shapes are preserved.
 */
import { type CoreDb } from '../../db/index.js';
import {
  getProvider,
  listProviders,
  runHealthCheck,
  upsertProvider,
} from '../modules/ai-providers/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreAiProvidersContract } from '../../contract/rest-ai-providers.js';

type Req = ServerInferRequest<typeof coreAiProvidersContract>;

export function makeAiProvidersHandlers(db: CoreDb) {
  return {
    list: () => runHttp(() => ({ status: 200 as const, body: listProviders(db) })),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({ status: 200 as const, body: getProvider(db, params.providerId) })),

    upsert: ({ body }: Req['upsert']) =>
      runHttp(() => ({ status: 200 as const, body: upsertProvider(db, body) })),

    healthCheck: ({ params }: Req['healthCheck']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await runHealthCheck(db, params.providerId),
      })),
  };
}
