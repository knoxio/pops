import { z } from 'zod';

import { ConnectionSchema } from '../src/contract/schemas/connection.js';
import { ItemSchema } from '../src/contract/schemas/item.js';
import { LocationSchema } from '../src/contract/schemas/location.js';
import { WarrantySchema } from '../src/contract/schemas/warranty.js';
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

const CreateItemBodySchema = z.object({
  name: z.string().min(1),
  location: z.string().nullable().optional(),
});

const UpdateItemBodySchema = CreateItemBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Item: zodToOpenApiSchema(ItemSchema),
    Location: zodToOpenApiSchema(LocationSchema),
    Warranty: zodToOpenApiSchema(WarrantySchema),
    Connection: zodToOpenApiSchema(ConnectionSchema),
    CreateItemInput: zodToOpenApiSchema(CreateItemBodySchema),
    UpdateItemInput: zodToOpenApiSchema(UpdateItemBodySchema),
    ItemListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('Item') },
        pagination: refTo('Pagination'),
      },
    },
    ItemResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('Item'),
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
