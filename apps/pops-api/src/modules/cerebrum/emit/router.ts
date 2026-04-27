/**
 * tRPC router for cerebrum.emit — document generation (PRD-083).
 *
 * Procedures:
 *   generate         — full generation pipeline (any mode)
 *   generateReport   — shorthand for report mode
 *   generateSummary  — shorthand for summary mode
 *   generateTimeline — shorthand for timeline mode
 *   preview          — dry run: sources + outline without full generation
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { GenerationService } from './generation-service.js';

import type { GenerationMode, TimelineGroupBy } from './types.js';

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

function getService(): GenerationService {
  return new GenerationService();
}

const dateRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const modeEnum = z.enum(['report', 'summary', 'timeline']);
const groupByEnum = z.enum(['type', 'month', 'quarter']);

const generationRequestSchema = z.object({
  mode: modeEnum,
  query: z.string().min(1).optional(),
  dateRange: dateRangeSchema.optional(),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  format: z.enum(['markdown', 'plain']).optional(),
  groupBy: groupByEnum.optional(),
});

const reportInputSchema = z.object({
  query: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const summaryInputSchema = z.object({
  dateRange: dateRangeSchema,
  query: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const timelineInputSchema = z.object({
  query: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  dateRange: dateRangeSchema.optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  groupBy: groupByEnum.optional(),
});

/**
 * Validate date range: from must be before or equal to to.
 */
function validateDateRange(dateRange?: { from: string; to: string }): void {
  if (!dateRange) return;
  if (dateRange.from > dateRange.to) {
    throw new ValidationError('Invalid date range: from must be before or equal to to');
  }
}

export const emitRouter = router({
  /** Full generation pipeline: any mode. */
  generate: protectedProcedure.input(generationRequestSchema).mutation(async ({ input }) => {
    try {
      // Validate mode-specific requirements.
      if (input.mode === 'report' && !input.query) {
        throw new ValidationError('Query is required for report mode');
      }
      if (input.mode === 'summary' && !input.dateRange) {
        throw new ValidationError('Date range is required for summary mode');
      }
      validateDateRange(input.dateRange);

      return await getService().generate({
        mode: input.mode as GenerationMode,
        query: input.query,
        dateRange: input.dateRange,
        scopes: input.scopes,
        audienceScope: input.audienceScope,
        includeSecret: input.includeSecret,
        types: input.types,
        tags: input.tags,
        format: input.format === 'plain' ? 'plain' : 'markdown',
        groupBy: input.groupBy as TimelineGroupBy | undefined,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Report generation shorthand. */
  generateReport: protectedProcedure.input(reportInputSchema).mutation(async ({ input }) => {
    try {
      return await getService().generateReport({
        mode: 'report',
        query: input.query,
        scopes: input.scopes,
        audienceScope: input.audienceScope,
        includeSecret: input.includeSecret,
        types: input.types,
        tags: input.tags,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Summary generation shorthand. */
  generateSummary: protectedProcedure.input(summaryInputSchema).mutation(async ({ input }) => {
    try {
      validateDateRange(input.dateRange);
      return await getService().generateSummary({
        mode: 'summary',
        query: input.query,
        dateRange: input.dateRange,
        scopes: input.scopes,
        audienceScope: input.audienceScope,
        includeSecret: input.includeSecret,
        types: input.types,
        tags: input.tags,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Timeline generation shorthand. */
  generateTimeline: protectedProcedure.input(timelineInputSchema).mutation(async ({ input }) => {
    try {
      validateDateRange(input.dateRange);
      return await getService().generateTimeline({
        mode: 'timeline',
        query: input.query,
        dateRange: input.dateRange,
        scopes: input.scopes,
        audienceScope: input.audienceScope,
        includeSecret: input.includeSecret,
        types: input.types,
        tags: input.tags,
        groupBy: input.groupBy as TimelineGroupBy | undefined,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Preview: returns sources and outline without full generation. */
  preview: protectedProcedure.input(generationRequestSchema).query(async ({ input }) => {
    try {
      validateDateRange(input.dateRange);
      return await getService().preview({
        mode: input.mode as GenerationMode,
        query: input.query,
        dateRange: input.dateRange,
        scopes: input.scopes,
        audienceScope: input.audienceScope,
        includeSecret: input.includeSecret,
        types: input.types,
        tags: input.tags,
        groupBy: input.groupBy as TimelineGroupBy | undefined,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),
});
