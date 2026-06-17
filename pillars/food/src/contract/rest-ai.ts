/**
 * `ai.*` sub-router — PRD-133 `logInference`. The pops-worker-food container
 * posts here on every Claude call so usage lands in the AI-ops surface.
 * Internal-only: the auth middleware in `app.ts` gates `/ai/log-inference`
 * on `x-pops-internal-token`. Best-effort — a write failure still returns
 * `{ ok: true }` so a logging hiccup never blocks an ingest.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const LogFoodInferenceBody = z.object({
  operation: z.enum([
    'recipe-extract-web-llm',
    'recipe-extract-ig-vision',
    'recipe-extract-ig-text-fallback',
    'recipe-extract-screenshot',
    'recipe-extract-text',
  ]),
  contextId: z.string().min(1),
  provider: z.literal('claude'),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  status: z.enum(['success', 'error']),
  cached: z.boolean(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const foodAiContract = c.router({
  logInference: {
    method: 'POST',
    path: '/ai/log-inference',
    body: LogFoodInferenceBody,
    responses: { 200: z.object({ ok: z.literal(true) }) },
    summary: 'Record a food AI inference (internal; worker → ai_inference_log)',
  },
});
