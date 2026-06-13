/**
 * Inference middleware — wraps every AI provider call with the persisted
 * `ai_inference_log` audit row, pricing/cost lookup, latency capture, error
 * classification, and pre-call budget enforcement.
 *
 * Every log write goes through `@pops/core-db`'s `aiUsageService.createInferenceLog`
 * resolved against the core pillar handle (`getCoreDrizzle()`), so each
 * audit row lands in `core.db` instead of the shared `pops.db`. Budget
 * enforcement reads land on the same store, so usage aggregation (cost,
 * tokens) now sees freshly inserted rows immediately — the read/write
 * staleness window that existed between PRD-186 PR 2 and PR 3 is gone.
 *
 * Errors during the log insert are swallowed and logged — the AI call's
 * result still propagates so a transient DB failure doesn't turn a
 * successful provider call into a hard error for the caller.
 */
import { aiUsageService } from '@pops/core-db';

import { getCoreDrizzle } from '../db.js';
import { enforceBudgets } from './inference-budget-enforcement.js';
import { lookupPricing } from './inference-pricing.js';
import { extractTokens } from './inference-tokens.js';
import { logger } from './logger.js';

import type {
  InferenceLogInsert,
  ResolvedInferenceParams,
  TrackInferenceParams,
} from './inference-middleware-types.js';

export type { TrackInferenceParams } from './inference-middleware-types.js';

function insertLog(values: InferenceLogInsert): void {
  try {
    aiUsageService.createInferenceLog(getCoreDrizzle(), values);
  } catch (err) {
    logger.warn({ err }, '[inference] Failed to log inference row');
  }
}

function resolveParams(params: TrackInferenceParams): ResolvedInferenceParams {
  return {
    domain: params.domain ?? null,
    contextId: params.contextId ?? null,
  };
}

function classifyError(error: unknown): { msg: string; isTimeout: boolean } {
  const msg = error instanceof Error ? error.message : String(error);
  const isTimeout =
    error instanceof Error &&
    (error.name === 'AbortError' || msg.toLowerCase().includes('timeout'));
  return { msg, isTimeout };
}

function buildLogValues(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  partial: Partial<InferenceLogInsert> &
    Pick<
      InferenceLogInsert,
      | 'inputTokens'
      | 'outputTokens'
      | 'costUsd'
      | 'latencyMs'
      | 'status'
      | 'cached'
      | 'errorMessage'
    >
): InferenceLogInsert {
  return {
    provider: params.provider,
    model: params.model,
    operation: params.operation,
    domain: resolved.domain,
    contextId: resolved.contextId,
    ...partial,
  };
}

async function trackCachedCall<T>(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const result = await fn();
    insertLog(
      buildLogValues(params, resolved, {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: 'success',
        cached: 1,
        errorMessage: null,
      })
    );
    return result;
  } catch (error) {
    const { msg, isTimeout } = classifyError(error);
    insertLog(
      buildLogValues(params, resolved, {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: isTimeout ? 'timeout' : 'error',
        cached: 1,
        errorMessage: msg.slice(0, 1000),
      })
    );
    throw error;
  }
}

async function trackLiveCall<T>(
  params: TrackInferenceParams,
  resolved: ResolvedInferenceParams,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    const latencyMs = Date.now() - start;
    const { msg, isTimeout } = classifyError(error);
    insertLog(
      buildLogValues(params, resolved, {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status: isTimeout ? 'timeout' : 'error',
        cached: 0,
        errorMessage: msg.slice(0, 1000),
      })
    );
    throw error;
  }

  const latencyMs = Date.now() - start;
  const { inputTokens, outputTokens } = extractTokens(result);
  const pricing = lookupPricing(params.provider, params.model);
  const costUsd =
    (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;

  insertLog(
    buildLogValues(params, resolved, {
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      status: 'success',
      cached: 0,
      errorMessage: null,
    })
  );

  return result;
}

export async function trackInference<T>(
  params: TrackInferenceParams,
  fn: () => Promise<T>
): Promise<T> {
  const resolved = resolveParams(params);
  if (params.cached ?? false) return trackCachedCall(params, resolved, fn);
  const effective = enforceBudgets(params, resolved, insertLog);
  return trackLiveCall(effective, resolveParams(effective), fn);
}
