/**
 * `aiProviders` sub-router — provider + model-pricing config and health checks.
 *
 * `get` returns a NULLABLE 200: an unknown providerId resolves to `null`, NOT a
 * 404. `upsert` carries its `id` in the body, so it stays a `POST` rather than a
 * path-id `PUT`. Output shapes mirror `ProviderWithModels` from
 * `api/modules/ai-providers/service.ts` exactly.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';

const c = initContract();

/** Mirrors `ModelPricing` in `api/modules/ai-providers/service.ts`. */
const ModelPricingSchema = z.object({
  id: z.number(),
  modelId: z.string(),
  displayName: z.string().nullable(),
  inputCostPerMtok: z.number(),
  outputCostPerMtok: z.number(),
  contextWindow: z.number().nullable(),
  isDefault: z.boolean(),
});

/** Mirrors `ProviderWithModels` in `api/modules/ai-providers/service.ts`. */
const ProviderWithModelsSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  baseUrl: z.string().nullable(),
  apiKeyRef: z.string().nullable(),
  status: z.string(),
  lastHealthCheck: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  models: z.array(ModelPricingSchema),
});

const ModelInputSchema = z.object({
  modelId: NonEmptyString,
  displayName: z.string().optional(),
  inputCostPerMtok: z.number().min(0).optional(),
  outputCostPerMtok: z.number().min(0).optional(),
  contextWindow: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
});

const UpsertProviderBody = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  type: z.enum(['cloud', 'local']),
  baseUrl: z.string().url().optional(),
  apiKeyRef: z.string().optional(),
  models: z.array(ModelInputSchema).optional(),
});

const HealthCheckResultSchema = z.object({
  status: z.enum(['active', 'error']),
  latencyMs: z.number(),
  error: z.string().optional(),
});

export const aiProvidersContract = c.router({
  list: {
    method: 'GET',
    path: '/ai-providers',
    responses: { 200: z.array(ProviderWithModelsSchema) },
    summary: 'List AI providers with their configured model pricing',
  },
  get: {
    method: 'GET',
    path: '/ai-providers/:providerId',
    pathParams: z.object({ providerId: z.string() }),
    responses: { 200: ProviderWithModelsSchema.nullable() },
    summary: 'Get a single AI provider with its models (null if unknown)',
  },
  upsert: {
    method: 'POST',
    path: '/ai-providers',
    body: UpsertProviderBody,
    responses: { 200: ProviderWithModelsSchema, ...ERR_RESPONSES },
    summary: 'Create or update an AI provider and its model pricing (keyed by id)',
  },
  healthCheck: {
    method: 'POST',
    path: '/ai-providers/:providerId/health-check',
    pathParams: z.object({ providerId: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: HealthCheckResultSchema },
    summary: 'Run a live health check against an AI provider and persist the result',
  },
});
