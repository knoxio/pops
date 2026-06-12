import { z } from 'zod';

import { PillarSchema } from '../src/schemas/pillar.js';
import { RegistryEntrySchema } from '../src/schemas/registry-entry.js';
import { ServiceAccountSchema } from '../src/schemas/service-account.js';
import { SettingSchema } from '../src/schemas/setting.js';
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

const RegisterPillarBodySchema = z.object({
  pillarId: z.string().min(1),
  baseUrl: z.string().url(),
});

const HeartbeatBodySchema = z.object({
  pillarId: z.string().min(1),
});

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Pillar: zodToOpenApiSchema(PillarSchema),
    RegistryEntry: zodToOpenApiSchema(RegistryEntrySchema),
    ServiceAccount: zodToOpenApiSchema(ServiceAccountSchema),
    Setting: zodToOpenApiSchema(SettingSchema),
    RegisterPillarInput: zodToOpenApiSchema(RegisterPillarBodySchema),
    HeartbeatInput: zodToOpenApiSchema(HeartbeatBodySchema),
    RegistryEntryListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('RegistryEntry') },
        pagination: refTo('Pagination'),
      },
    },
    RegistryEntryResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('RegistryEntry'),
        message: { type: 'string' },
      },
    },
    HeartbeatResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('RegistryEntry'),
        message: { type: 'string' },
      },
    },
    DeregisterResponse: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
  };
}
