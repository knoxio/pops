/**
 * Handlers for the `ai-usage.*` sub-router.
 *
 * Thin wrappers over `ai-usage/service.ts` (stats + history, reading the ai
 * pillar's `ai.db`). The AI-entity cache surface (`getCacheStats` / prune /
 * clear) did NOT move with the telemetry — it is finance-categorizer state
 * (`ai_entity_cache.json`) re-homed to finance later (Open Decision 1), so it
 * stays in core. Wire shapes are preserved for the moved telemetry reads.
 */
import { type AiDb } from '../../db/index.js';
import { getHistory, getStats } from '../modules/ai-usage/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiUsageContract } from '../../contract/rest-ai-usage.js';

type Req = ServerInferRequest<typeof aiUsageContract>;

export function makeAiUsageHandlers(db: AiDb) {
  return {
    getStats: () => runHttp(() => ({ status: 200 as const, body: getStats(db) })),

    getHistory: ({ query }: Req['getHistory']) =>
      runHttp(() => ({
        status: 200 as const,
        body: getHistory(db, query.startDate, query.endDate),
      })),
  };
}
