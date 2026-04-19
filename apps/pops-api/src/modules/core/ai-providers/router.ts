import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { getProvider, listProviders, runHealthCheck, upsertProvider } from './service.js';

const modelInput = z.object({
  modelId: z.string().min(1),
  displayName: z.string().optional(),
  inputCostPerMtok: z.number().min(0).optional(),
  outputCostPerMtok: z.number().min(0).optional(),
  contextWindow: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
});

const upsertInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['cloud', 'local']),
  baseUrl: z.string().url().optional(),
  apiKeyRef: z.string().optional(),
  models: z.array(modelInput).optional(),
});

export const aiProvidersRouter = router({
  list: protectedProcedure.query(() => listProviders()),

  get: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(({ input }) => getProvider(input.providerId)),

  upsert: protectedProcedure.input(upsertInput).mutation(({ input }) => upsertProvider(input)),

  healthCheck: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(({ input }) => runHealthCheck(input.providerId)),
});
