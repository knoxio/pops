import { z } from 'zod';

import { EngramSchema } from '../src/schemas/engram.js';
import { NudgeSchema, NudgeStatusSchema } from '../src/schemas/nudge.js';
import { ScopeSchema } from '../src/schemas/scope.js';
import { refTo, type OpenApiSchema } from './openapi-types.js';

const PAGINATION_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['total', 'limit', 'offset'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    offset: { type: 'integer', minimum: 0 },
    hasMore: { type: 'boolean' },
  },
};

const CreateEngramBodySchema = z.object({
  content: z.string().min(1),
});

const UpdateEngramBodySchema = CreateEngramBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Engram: zodToOpenApiSchema(EngramSchema),
    Nudge: zodToOpenApiSchema(NudgeSchema),
    NudgeStatus: zodToOpenApiSchema(NudgeStatusSchema),
    Scope: zodToOpenApiSchema(ScopeSchema),
    CreateEngramInput: zodToOpenApiSchema(CreateEngramBodySchema),
    UpdateEngramInput: zodToOpenApiSchema(UpdateEngramBodySchema),
    EngramListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('Engram') },
        pagination: refTo('Pagination'),
      },
    },
    EngramResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('Engram'),
        message: { type: 'string' },
      },
    },
    DeleteResponse: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
  };
}
