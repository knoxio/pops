/**
 * tRPC router for cerebrum.ingest (PRD-081 US-02, US-03).
 *
 * Procedures:
 *   submit          — full pipeline: normalise → classify → extract → infer → write
 *   preview         — dry-run full pipeline (no write)
 *   classify        — run CortexClassifier only
 *   extractEntities — run CortexEntityExtractor only
 *   inferScopes     — run ScopeInferenceService only
 *   quickCapture    — store raw capture + enqueue async enrichment
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { engramSourceSchema } from '../engrams/schema.js';
import { IngestService } from './pipeline.js';

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    const details = err.details;
    let message: string;
    if (typeof details === 'string') {
      message = details;
    } else if (
      typeof details === 'object' &&
      details !== null &&
      typeof (details as { message?: unknown }).message === 'string'
    ) {
      message = (details as { message: string }).message;
    } else {
      message = err.message;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message, cause: err });
  }
  if (err instanceof HttpError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
  throw err;
}

function getService(): IngestService {
  return new IngestService();
}

const submitSchema = z.object({
  body: z.string().min(1),
  title: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  template: z.string().min(1).optional(),
  source: engramSourceSchema.optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const classifySchema = z.object({
  body: z.string().min(1),
  title: z.string().min(1).optional(),
});

const extractEntitiesSchema = z.object({
  body: z.string().min(1),
  existingTags: z.array(z.string().min(1)).optional(),
});

const inferScopesSchema = z.object({
  body: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  source: engramSourceSchema.optional(),
  explicitScopes: z.array(z.string().min(1)).optional(),
  knownScopes: z.array(z.string().min(1)).optional(),
});

const quickCaptureSchema = z.object({
  text: z.string().min(1),
  source: engramSourceSchema.optional(),
});

export const ingestRouter = router({
  submit: protectedProcedure.input(submitSchema).mutation(async ({ input }) => {
    try {
      const result = await getService().submit(input);
      return result;
    } catch (err) {
      toTrpcError(err);
    }
  }),

  preview: protectedProcedure.input(submitSchema).query(async ({ input }) => {
    try {
      const result = await getService().preview(input);
      return result;
    } catch (err) {
      toTrpcError(err);
    }
  }),

  classify: protectedProcedure.input(classifySchema).query(async ({ input }) => {
    try {
      return await getService().classify(input.body, input.title);
    } catch (err) {
      toTrpcError(err);
    }
  }),

  extractEntities: protectedProcedure.input(extractEntitiesSchema).query(async ({ input }) => {
    try {
      return await getService().extractEntities(input.body, input.existingTags);
    } catch (err) {
      toTrpcError(err);
    }
  }),

  inferScopes: protectedProcedure.input(inferScopesSchema).query(async ({ input }) => {
    try {
      return await getService().inferScopes({
        body: input.body,
        type: input.type,
        tags: input.tags ?? [],
        source: input.source ?? 'manual',
        explicitScopes: input.explicitScopes,
        knownScopes: input.knownScopes,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  quickCapture: protectedProcedure.input(quickCaptureSchema).mutation(async ({ input }) => {
    try {
      return await getService().quickCapture(input.text, input.source);
    } catch (err) {
      toTrpcError(err);
    }
  }),
});
