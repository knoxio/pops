/**
 * Handlers for the `ai-observability.*` sub-router.
 *
 * Thin read-only wrappers over the existing `ai-observability/service.ts`
 * (stats, history, latency percentiles, per-model quality metrics — all
 * landing on `core.db`). The optional filter query is forwarded as-is. Wire
 * shapes are preserved.
 */
import { type AiDb } from '../../db/index.js';
import {
  getHistory,
  getLatencyStats,
  getQualityMetrics,
  getStats,
} from '../modules/ai-observability/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiObservabilityContract } from '../../contract/rest-ai-observability.js';

type Req = ServerInferRequest<typeof aiObservabilityContract>;

export function makeAiObservabilityHandlers(db: AiDb) {
  return {
    getStats: ({ query }: Req['getStats']) =>
      runHttp(() => ({ status: 200 as const, body: getStats(db, query) })),

    getHistory: ({ query }: Req['getHistory']) =>
      runHttp(() => ({ status: 200 as const, body: getHistory(db, query) })),

    getLatencyStats: ({ query }: Req['getLatencyStats']) =>
      runHttp(() => ({ status: 200 as const, body: getLatencyStats(db, query) })),

    getQualityMetrics: ({ query }: Req['getQualityMetrics']) =>
      runHttp(() => ({ status: 200 as const, body: getQualityMetrics(db, query) })),
  };
}
