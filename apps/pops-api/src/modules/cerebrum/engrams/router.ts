/**
 * tRPC router for cerebrum.engrams.
 *
 * The router is a thin adapter over the EngramService — no file or database
 * work lives here. All business logic belongs to the service layer.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramService } from '../instance.js';
import { ENGRAM_STATUSES, engramIdSchema, engramSourceSchema } from './schema.js';

const customFieldsSchema = z.record(z.string(), z.unknown());

const sortSchema = z.object({
  field: z.enum(['created_at', 'modified_at', 'title']),
  direction: z.enum(['asc', 'desc']),
});

const createSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  // `.min(1)` matches the engram frontmatter contract (at least one scope
  // required). A template may inject `default_scopes`, so we allow `scopes`
  // itself to be omitted — but never an empty array.
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  template: z.string().min(1).optional(),
  customFields: customFieldsSchema.optional(),
  source: engramSourceSchema.optional(),
  links: z.array(engramIdSchema).optional(),
});

const updateSchema = z.object({
  id: engramIdSchema,
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  // If `scopes` is present it must be non-empty; the frontmatter validator
  // would otherwise reject the resulting file mid-write.
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  customFields: customFieldsSchema.optional(),
  status: z.enum(ENGRAM_STATUSES).optional(),
});

const listSchema = z
  .object({
    type: z.string().optional(),
    scopes: z.array(z.string().min(1)).optional(),
    tags: z.array(z.string().min(1)).optional(),
    status: z.enum(ENGRAM_STATUSES).optional(),
    search: z.string().optional(),
    limit: z.number().int().positive().max(500).optional(),
    offset: z.number().int().nonnegative().optional(),
    sort: sortSchema.optional(),
  })
  .optional();

const linkSchema = z.object({
  sourceId: engramIdSchema,
  targetId: engramIdSchema,
});

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    // ValidationError.message is the generic "Validation failed" — the actual
    // reason is stashed in `details`. Surface it so clients can show
    // actionable feedback (e.g. "decision, alternatives are required").
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

export const engramsRouter = router({
  create: protectedProcedure.input(createSchema).mutation(({ input }) => {
    try {
      const engram = getEngramService().create(input);
      return { engram };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  get: protectedProcedure.input(z.object({ id: engramIdSchema })).query(({ input }) => {
    try {
      const { engram, body } = getEngramService().read(input.id);
      return { engram, body };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  update: protectedProcedure.input(updateSchema).mutation(({ input }) => {
    try {
      const { id, ...changes } = input;
      const engram = getEngramService().update(id, changes);
      return { engram };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  delete: protectedProcedure.input(z.object({ id: engramIdSchema })).mutation(({ input }) => {
    try {
      getEngramService().archive(input.id);
      return { success: true };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  list: protectedProcedure.input(listSchema).query(({ input }) => {
    const { engrams, total } = getEngramService().list(input ?? {});
    return { engrams, total };
  }),

  link: protectedProcedure.input(linkSchema).mutation(({ input }) => {
    try {
      getEngramService().link(input.sourceId, input.targetId);
      return { success: true };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  unlink: protectedProcedure.input(linkSchema).mutation(({ input }) => {
    try {
      getEngramService().unlink(input.sourceId, input.targetId);
      return { success: true };
    } catch (err) {
      toTrpcError(err);
    }
  }),
});
