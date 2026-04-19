import { aiInferenceLog, aiModelPricing } from '@pops/db-types';

import { getDrizzle } from '../db.js';
import { logger } from './logger.js';

export interface TrackInferenceParams {
  provider: string;
  model: string;
  operation: string;
  domain?: string;
  contextId?: string;
  cached?: boolean;
}

interface PricingEntry {
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  cachedAt: number;
}

const pricingCache = new Map<string, PricingEntry>();
const PRICING_TTL_MS = 5 * 60 * 1000;

function lookupPricing(provider: string, model: string): { input: number; output: number } {
  const key = `${provider}:${model}`;
  const cached = pricingCache.get(key);
  if (cached && Date.now() - cached.cachedAt < PRICING_TTL_MS) {
    return { input: cached.inputCostPerMtok, output: cached.outputCostPerMtok };
  }
  try {
    const now = Date.now();
    const rows = getDrizzle()
      .select({
        providerId: aiModelPricing.providerId,
        modelId: aiModelPricing.modelId,
        inputCostPerMtok: aiModelPricing.inputCostPerMtok,
        outputCostPerMtok: aiModelPricing.outputCostPerMtok,
      })
      .from(aiModelPricing)
      .all();
    for (const row of rows) {
      pricingCache.set(`${row.providerId}:${row.modelId}`, {
        inputCostPerMtok: row.inputCostPerMtok,
        outputCostPerMtok: row.outputCostPerMtok,
        cachedAt: now,
      });
    }
    const entry = pricingCache.get(key);
    if (entry) return { input: entry.inputCostPerMtok, output: entry.outputCostPerMtok };
  } catch {
    // pricing lookup is best-effort
  }
  // Fallback: Haiku rates
  return { input: 1.0, output: 5.0 };
}

function insertLog(values: {
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
}): void {
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

export async function trackInference<T>(
  params: TrackInferenceParams,
  fn: () => Promise<T>
): Promise<T> {
  const isCached = params.cached ?? false;
  const domain = params.domain ?? null;
  const contextId = params.contextId ?? null;

  if (isCached) {
    try {
      const result = await fn();
      insertLog({
        provider: params.provider,
        model: params.model,
        operation: params.operation,
        domain,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: 'success',
        cached: 1,
        contextId,
        errorMessage: null,
      });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || msg.toLowerCase().includes('timeout'));
      insertLog({
        provider: params.provider,
        model: params.model,
        operation: params.operation,
        domain,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: isTimeout ? 'timeout' : 'error',
        cached: 1,
        contextId,
        errorMessage: msg.slice(0, 1000),
      });
      throw error;
    }
  }

  const start = Date.now();
  let result: T;

  try {
    result = await fn();
  } catch (error) {
    const latencyMs = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || msg.toLowerCase().includes('timeout'));
    insertLog({
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      domain,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      status: isTimeout ? 'timeout' : 'error',
      cached: 0,
      contextId,
      errorMessage: msg.slice(0, 1000),
    });
    throw error;
  }

  const latencyMs = Date.now() - start;

  let inputTokens = 0;
  let outputTokens = 0;
  if (result !== null && result !== undefined && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (r['usage'] && typeof r['usage'] === 'object') {
      const u = r['usage'] as Record<string, unknown>;
      if (typeof u['input_tokens'] === 'number') inputTokens = u['input_tokens'];
      if (typeof u['output_tokens'] === 'number') outputTokens = u['output_tokens'];
    }
  }

  const pricing = lookupPricing(params.provider, params.model);
  const costUsd =
    (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;

  insertLog({
    provider: params.provider,
    model: params.model,
    operation: params.operation,
    domain,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
    status: 'success',
    cached: 0,
    contextId,
    errorMessage: null,
  });

  return result;
}
