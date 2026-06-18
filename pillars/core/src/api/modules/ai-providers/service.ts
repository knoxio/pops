/**
 * AI providers module — provider + model-pricing CRUD and health checks
 * for `core.aiProviders.*`.
 *
 * Reads and writes run against the request-scoped core drizzle handle
 * (`ctx.coreDb`) over the relocated `ai_providers` + `ai_model_pricing`
 * tables instead of the monolith's `getCoreDrizzle()` singleton.
 */
import { eq } from 'drizzle-orm';

import { aiModelPricing, aiProviders, type CoreDb } from '../../../db/index.js';
import { getAnthropicApiKey } from '../../shared/anthropic-api-key.js';
import { logger } from '../../shared/logger.js';

export interface ProviderWithModels {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  apiKeyRef: string | null;
  status: string;
  lastHealthCheck: string | null;
  lastLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
  models: ModelPricing[];
}

export interface ModelPricing {
  id: number;
  modelId: string;
  displayName: string | null;
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  contextWindow: number | null;
  isDefault: boolean;
}

export interface UpsertProviderInput {
  id: string;
  name: string;
  type: 'cloud' | 'local';
  baseUrl?: string;
  apiKeyRef?: string;
  models?: {
    modelId: string;
    displayName?: string;
    inputCostPerMtok?: number;
    outputCostPerMtok?: number;
    contextWindow?: number;
    isDefault?: boolean;
  }[];
}

function rowToModel(row: typeof aiModelPricing.$inferSelect): ModelPricing {
  return {
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName,
    inputCostPerMtok: row.inputCostPerMtok,
    outputCostPerMtok: row.outputCostPerMtok,
    contextWindow: row.contextWindow,
    isDefault: row.isDefault === 1,
  };
}

export function listProviders(db: CoreDb): ProviderWithModels[] {
  const providers = db.select().from(aiProviders).all();
  const allModels = db.select().from(aiModelPricing).all();

  return providers.map((p) => ({
    ...p,
    models: allModels.filter((m) => m.providerId === p.id).map(rowToModel),
  }));
}

export function getProvider(db: CoreDb, providerId: string): ProviderWithModels | null {
  const [provider] = db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).all();
  if (!provider) return null;
  const models = db
    .select()
    .from(aiModelPricing)
    .where(eq(aiModelPricing.providerId, providerId))
    .all();
  return { ...provider, models: models.map(rowToModel) };
}

type ModelInput = NonNullable<UpsertProviderInput['models']>[number];

function upsertProviderRow(db: CoreDb, input: UpsertProviderInput, now: string): void {
  const baseUrl = input.baseUrl ?? null;
  const apiKeyRef = input.apiKeyRef ?? null;
  db.insert(aiProviders)
    .values({
      id: input.id,
      name: input.name,
      type: input.type,
      baseUrl,
      apiKeyRef,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiProviders.id,
      set: {
        name: input.name,
        type: input.type,
        baseUrl,
        apiKeyRef,
        status: 'active',
        updatedAt: now,
      },
    })
    .run();
}

function upsertModelRow(db: CoreDb, providerId: string, model: ModelInput, now: string): void {
  const displayName = model.displayName ?? null;
  const inputCostPerMtok = model.inputCostPerMtok ?? 0;
  const outputCostPerMtok = model.outputCostPerMtok ?? 0;
  const contextWindow = model.contextWindow ?? null;
  const isDefault = model.isDefault ? 1 : 0;
  db.insert(aiModelPricing)
    .values({
      providerId,
      modelId: model.modelId,
      displayName,
      inputCostPerMtok,
      outputCostPerMtok,
      contextWindow,
      isDefault,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiModelPricing.providerId, aiModelPricing.modelId],
      set: {
        displayName,
        inputCostPerMtok,
        outputCostPerMtok,
        contextWindow,
        isDefault,
        updatedAt: now,
      },
    })
    .run();
}

export function upsertProvider(db: CoreDb, input: UpsertProviderInput): ProviderWithModels {
  const now = new Date().toISOString();
  upsertProviderRow(db, input, now);
  if (input.models) {
    for (const model of input.models) {
      upsertModelRow(db, input.id, model, now);
    }
  }
  const result = getProvider(db, input.id);
  if (!result) throw new Error(`Provider not found: ${input.id}`);
  return result;
}

export async function runHealthCheck(
  db: CoreDb,
  providerId: string
): Promise<{ status: 'active' | 'error'; latencyMs: number; error?: string }> {
  const provider = getProvider(db, providerId);
  if (!provider) {
    return { status: 'error', latencyMs: 0, error: 'Provider not found' };
  }

  const start = Date.now();
  let status: 'active' | 'error' = 'active';
  let errorMsg: string | undefined;

  try {
    if (provider.type === 'local' && provider.baseUrl) {
      const res = await fetch(`${provider.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else if (provider.id === 'claude') {
      const apiKey = getAnthropicApiKey();
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      throw new Error(`Unknown provider type: ${provider.type}`);
    }
  } catch (err) {
    status = 'error';
    errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ providerId, error: errorMsg }, '[ai-providers] Health check failed');
  }

  const latencyMs = Date.now() - start;
  const now = new Date().toISOString();

  db.update(aiProviders)
    .set({ status, lastHealthCheck: now, lastLatencyMs: latencyMs, updatedAt: now })
    .where(eq(aiProviders.id, providerId))
    .run();

  return { status, latencyMs, error: errorMsg };
}
