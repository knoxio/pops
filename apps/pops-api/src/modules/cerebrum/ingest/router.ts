/**
 * tRPC router for cerebrum.ingest (PRD-081 US-02, US-03, US-07).
 *
 * Procedures:
 *   submit            — full pipeline: normalise → classify → extract → infer → write
 *   preview           — dry-run full pipeline (no write)
 *   classify          — run CortexClassifier only
 *   extractEntities   — run CortexEntityExtractor only
 *   inferScopes       — run ScopeInferenceService only
 *   quickCapture      — store raw capture + enqueue async enrichment
 *   enrichmentStatus  — poll the enrichment state of an engram (US-07)
 *   retryEnrichment   — re-enqueue the classifyEngram job (US-07)
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getCurationQueue } from '../../../jobs/queues.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { engramSourceSchema } from '../engrams/schema.js';
import { getEngramService } from '../instance.js';
import { IngestService } from './pipeline.js';

const scopeSuggestionSchema = z.object({
  original: z.string(),
  canonical: z.string(),
  confidence: z.number(),
  reason: z.string(),
});
const scopeSuggestionsSchema = z.array(scopeSuggestionSchema).catch([]);

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
  /**
   * User-suggested scopes (PRD-081 US-01). When provided they are written
   * to the engram immediately and the curation worker runs scope
   * reconciliation against the existing vocabulary (US-10) instead of
   * inferring from scratch.
   */
  scopes: z.array(z.string().min(1)).optional(),
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
      return await getService().quickCapture(input.text, input.source, input.scopes);
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /**
   * Poll the enrichment state of an engram (PRD-081 US-07).
   *
   * Returns whether the curation worker has completed for this engram (signalled
   * by `_enrichedHash` matching the current content hash) and surfaces the
   * inferred type, template, scopes, tags, plus any reconciliation suggestions
   * waiting to be reviewed.
   */
  enrichmentStatus: protectedProcedure
    .input(z.object({ engramId: z.string().min(1) }))
    .query(({ input }) => {
      try {
        const { engram } = getEngramService().read(input.engramId);
        const enrichedHash = engram.customFields['_enrichedHash'];
        const enriched = enrichedHash === engram.contentHash;
        const rawSuggestions = engram.customFields['_scope_suggestions'];
        const scopeSuggestions = Array.isArray(rawSuggestions)
          ? scopeSuggestionsSchema.parse(rawSuggestions)
          : [];
        return {
          enriched,
          type: engram.type,
          template: engram.template,
          scopes: engram.scopes,
          tags: engram.tags,
          scopeSuggestions,
        };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Re-enqueue the classifyEngram job for an engram (PRD-081 US-07).
   *
   * Used by the post-ingest review when the prior enrichment failed. The
   * curation handler is idempotent via `_enrichedHash`, so a redundant retry
   * on already-enriched content is a no-op.
   */
  retryEnrichment: protectedProcedure
    .input(z.object({ engramId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        // Verify the engram exists before enqueueing.
        getEngramService().read(input.engramId);
        const queue = getCurationQueue();
        if (!queue) {
          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Curation queue unavailable — Redis not configured',
          });
        }
        await queue.add('classifyEngram', {
          type: 'classifyEngram',
          engramId: input.engramId,
        });
        return { engramId: input.engramId, requeued: true as const };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        toTrpcError(err);
      }
    }),
});
