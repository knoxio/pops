/**
 * Handler for `ai.logInference`. Writes one row to the pillar's
 * `ai_inference_log` with `domain='food'`; server-authored `promptVersion`
 * wins over caller metadata. Best-effort: a DB-write failure is logged and
 * swallowed so logging never blocks an ingest.
 */
import { aiInferenceLog, type FoodDb } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodAiContract } from '../../contract/rest-ai.js';

type Req = ServerInferRequest<typeof foodAiContract>;

export function makeAiHandlers(db: FoodDb) {
  return {
    logInference: ({ body }: Req['logInference']) =>
      runHttp(() => {
        const merged: Record<string, unknown> = {
          ...body.metadata,
          prompt_version: body.promptVersion,
        };
        try {
          db.insert(aiInferenceLog)
            .values({
              provider: body.provider,
              model: body.model,
              operation: body.operation,
              domain: 'food',
              inputTokens: body.inputTokens,
              outputTokens: body.outputTokens,
              costUsd: body.costUsd,
              latencyMs: body.latencyMs,
              status: body.status,
              cached: body.cached ? 1 : 0,
              contextId: body.contextId,
              errorMessage: body.errorMessage ?? null,
              metadata: JSON.stringify(merged),
              createdAt: new Date().toISOString(),
            })
            .run();
        } catch (err) {
          console.warn('[food.ai.logInference] failed to insert ai_inference_log row', err);
        }
        return { status: 200 as const, body: { ok: true as const } };
      }),
  };
}
