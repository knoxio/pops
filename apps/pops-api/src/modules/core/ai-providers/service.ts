import { eq } from 'drizzle-orm';

import { aiModelPricing, aiProviders } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { logger } from '../../../lib/logger.js';

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

export function listProviders(): ProviderWithModels[] {
  const db = getDrizzle();
  const providers = db.select().from(aiProviders).all();
  const allModels = db.select().from(aiModelPricing).all();

  return providers.map((p) => ({
    ...p,
    models: allModels.filter((m) => m.providerId === p.id).map(rowToModel),
  }));
}

export function getProvider(providerId: string): ProviderWithModels | null {
  const db = getDrizzle();
  const [provider] = db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).all();
  if (!provider) return null;
  const models = db
    .select()
    .from(aiModelPricing)
    .where(eq(aiModelPricing.providerId, providerId))
    .all();
  return { ...provider, models: models.map(rowToModel) };
}

export function upsertProvider(input: UpsertProviderInput): ProviderWithModels {
  const db = getDrizzle();
  const now = new Date().toISOString();

  db.insert(aiProviders)
    .values({
      id: input.id,
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl ?? null,
      apiKeyRef: input.apiKeyRef ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiProviders.id,
      set: {
        name: input.name,
        type: input.type,
        baseUrl: input.baseUrl ?? null,
        apiKeyRef: input.apiKeyRef ?? null,
        status: 'active',
        updatedAt: now,
      },
    })
    .run();

  if (input.models) {
    for (const model of input.models) {
      db.insert(aiModelPricing)
        .values({
          providerId: input.id,
          modelId: model.modelId,
          displayName: model.displayName ?? null,
          inputCostPerMtok: model.inputCostPerMtok ?? 0,
          outputCostPerMtok: model.outputCostPerMtok ?? 0,
          contextWindow: model.contextWindow ?? null,
          isDefault: model.isDefault ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [aiModelPricing.providerId, aiModelPricing.modelId],
          set: {
            displayName: model.displayName ?? null,
            inputCostPerMtok: model.inputCostPerMtok ?? 0,
            outputCostPerMtok: model.outputCostPerMtok ?? 0,
            contextWindow: model.contextWindow ?? null,
            isDefault: model.isDefault ? 1 : 0,
            updatedAt: now,
          },
        })
        .run();
    }
  }

  const result = getProvider(input.id);
  if (!result) throw new Error(`Provider not found: ${input.id}`);
  return result;
}

export async function runHealthCheck(
  providerId: string
): Promise<{ status: 'active' | 'error'; latencyMs: number; error?: string }> {
  const provider = getProvider(providerId);
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
      const apiKey = getEnv('CLAUDE_API_KEY');
      if (!apiKey) throw new Error('CLAUDE_API_KEY not configured');
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

  getDrizzle()
    .update(aiProviders)
    .set({ status, lastHealthCheck: now, lastLatencyMs: latencyMs, updatedAt: now })
    .where(eq(aiProviders.id, providerId))
    .run();

  return { status, latencyMs, error: errorMsg };
}
