import { z } from 'zod';

import {
  CreateInputSchema as DebriefCreateInputSchema,
  DebriefMediaTypeSchema,
  DebriefResultSchema,
  DebriefSessionSchema,
  DebriefSessionStatusSchema,
  DebriefStatusSchema,
  DeleteByWatchHistoryIdInputSchema as DebriefDeleteByWatchHistoryIdInputSchema,
  DismissInputSchema as DebriefDismissInputSchema,
  GetByMediaInputSchema as DebriefGetByMediaInputSchema,
  GetInputSchema as DebriefGetInputSchema,
  ListPendingInputSchema as DebriefListPendingInputSchema,
  LogWatchCompletionInputSchema as DebriefLogWatchCompletionInputSchema,
  RecordInputSchema as DebriefRecordInputSchema,
} from '../src/schemas/debrief.js';
import { refTo, type OpenApiSchema } from './openapi-types.js';

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildDebriefComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    DebriefMediaType: zodToOpenApiSchema(DebriefMediaTypeSchema),
    DebriefSessionStatus: zodToOpenApiSchema(DebriefSessionStatusSchema),
    DebriefSession: zodToOpenApiSchema(DebriefSessionSchema),
    DebriefResult: zodToOpenApiSchema(DebriefResultSchema),
    DebriefStatus: zodToOpenApiSchema(DebriefStatusSchema),
    DebriefRecordInput: zodToOpenApiSchema(DebriefRecordInputSchema),
    DebriefDismissInput: zodToOpenApiSchema(DebriefDismissInputSchema),
    DebriefListPendingInput: zodToOpenApiSchema(DebriefListPendingInputSchema),
    DebriefCreateInput: zodToOpenApiSchema(DebriefCreateInputSchema),
    DebriefGetInput: zodToOpenApiSchema(DebriefGetInputSchema),
    DebriefGetByMediaInput: zodToOpenApiSchema(DebriefGetByMediaInputSchema),
    DebriefLogWatchCompletionInput: zodToOpenApiSchema(DebriefLogWatchCompletionInputSchema),
    DebriefDeleteByWatchHistoryIdInput: zodToOpenApiSchema(
      DebriefDeleteByWatchHistoryIdInputSchema
    ),
    DebriefSessionResponse: {
      type: 'object',
      required: ['data'],
      properties: { data: refTo('DebriefSession') },
    },
    DebriefSessionNullableResponse: {
      type: 'object',
      required: ['data'],
      properties: { data: { oneOf: [refTo('DebriefSession'), { type: 'null' }] } },
    },
    DebriefSessionListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('DebriefSession') },
        pagination: refTo('Pagination'),
      },
    },
    DebriefResultResponse: {
      type: 'object',
      required: ['data'],
      properties: { data: refTo('DebriefResult') },
    },
    DebriefLogWatchCompletionResponse: {
      type: 'object',
      required: ['sessionId', 'dimensionsQueued'],
      properties: {
        sessionId: { type: 'integer', minimum: 1 },
        dimensionsQueued: { type: 'integer', minimum: 0 },
      },
    },
    DebriefDeleteByWatchHistoryIdResponse: {
      type: 'object',
      required: ['deletedSessions', 'deletedResults'],
      properties: {
        deletedSessions: { type: 'integer', minimum: 0 },
        deletedResults: { type: 'integer', minimum: 0 },
      },
    },
  };
}
