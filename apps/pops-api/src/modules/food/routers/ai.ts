import { z } from 'zod';

/**
 * PRD-133 — `food.ai.logInference` internal mutation.
 *
 * The pops-worker-food container (PRD-126) posts here on every Claude
 * call so usage shows up in the cross-domain AI Ops surface (theme 05).
 * Auth gates the endpoint behind `POPS_API_INTERNAL_TOKEN` via
 * `internalProcedure`.
 *
 * Logging is best-effort by design: the wrapper in
 * `packages/app-food/src/ai/log-inference.ts` swallows failures so a
 * logging hiccup never blocks an ingest. The mutation still surfaces
 * structural validation errors back to the caller; only DB-write
 * failures get downgraded — those land in pops-api logs.
 *
 * No new schema. Writes a single row to `ai_inference_log` with
 * `domain = 'food'`. The cost is computed worker-side per PRD-133's
 * shape.
 */
import { aiInferenceLog } from '@pops/db-types';

import { getCoreDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { internalProcedure, router } from '../../../trpc.js';

const FoodOperationSchema = z.enum([
  'recipe-extract-web-llm',
  'recipe-extract-ig-vision',
  'recipe-extract-ig-text-fallback',
  'recipe-extract-screenshot',
  'recipe-extract-text',
]);

export const LogFoodInferenceInput = z.object({
  operation: FoodOperationSchema,
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

export const LogFoodInferenceOutput = z.object({
  ok: z.literal(true),
});

export const aiRouter = router({
  logInference: internalProcedure
    .input(LogFoodInferenceInput)
    .output(LogFoodInferenceOutput)
    .mutation(({ input }) => {
      // Server-authored fields (prompt_version) win over caller-supplied
      // metadata so the prompt-viewer correlation can't be spoofed by a
      // worker passing a stale version in `metadata.prompt_version`.
      const merged: Record<string, unknown> = {
        ...input.metadata,
        prompt_version: input.promptVersion,
      };

      try {
        getCoreDrizzle()
          .insert(aiInferenceLog)
          .values({
            provider: input.provider,
            model: input.model,
            operation: input.operation,
            domain: 'food',
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            costUsd: input.costUsd,
            latencyMs: input.latencyMs,
            status: input.status,
            cached: input.cached ? 1 : 0,
            contextId: input.contextId,
            errorMessage: input.errorMessage ?? null,
            metadata: JSON.stringify(merged),
            createdAt: new Date().toISOString(),
          })
          .run();
      } catch (err) {
        logger.warn({ err }, '[food.ai.logInference] failed to insert ai_inference_log row');
      }

      return { ok: true } as const;
    }),
});

export type AiRouter = typeof aiRouter;
