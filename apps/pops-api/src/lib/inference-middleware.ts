import { aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../db.js';
import { lookupPricing } from './inference-pricing.js';
import { logger } from './logger.js';

export interface TrackInferenceParams {
  provider: string;
  model: string;
  operation: string;
  domain?: string;
  contextId?: string;
  cached?: boolean;
}

interface LogValues {
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  cached: number;
  contextId: string | null;
  errorMessage: string | null;
}

function insertLog(values: LogValues): void {
  try {
    getDrizzle()
      .insert(aiInferenceLog)
      .values({
        ...values,
        metadata: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    logger.warn({ err }, '[inference] Failed to log inference row');
  }
}

interface ResolvedParams {
  domain: string | null;
  contextId: string | null;
}

function resolveParams(params: TrackInferenceParams): ResolvedParams {
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
  resolved: ResolvedParams,
  partial: Partial<LogValues> &
    Pick<
      LogValues,
      | 'inputTokens'
      | 'outputTokens'
      | 'costUsd'
      | 'latencyMs'
      | 'status'
      | 'cached'
      | 'errorMessage'
    >
): LogValues {
  return {
    provider: params.provider,
    model: params.model,
    operation: params.operation,
    domain: resolved.domain,
    contextId: resolved.contextId,
    ...partial,
  };
}

function extractTokens(result: unknown): { inputTokens: number; outputTokens: number } {
  if (result === null || result === undefined || typeof result !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const r = result as Record<string, unknown>;
  if (!r['usage'] || typeof r['usage'] !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const u = r['usage'] as Record<string, unknown>;
  return {
    inputTokens: typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0,
    outputTokens: typeof u['output_tokens'] === 'number' ? u['output_tokens'] : 0,
  };
}

async function trackCachedCall<T>(
  params: TrackInferenceParams,
  resolved: ResolvedParams,
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
  resolved: ResolvedParams,
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
  return trackLiveCall(params, resolved, fn);
}
