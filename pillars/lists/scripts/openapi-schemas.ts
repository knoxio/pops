import { z } from 'zod';

import { AgendaItemSchema } from '../src/contract/schemas/agenda-item.js';
import { ListItemSchema } from '../src/contract/schemas/list-item.js';
import { ProjectSchema } from '../src/contract/schemas/project.js';
import { TagSchema } from '../src/contract/schemas/tag.js';
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

const CreateListItemBodySchema = z.object({
  name: z.string().min(1),
  completed: z.boolean().optional(),
});

const UpdateListItemBodySchema = CreateListItemBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    AgendaItem: zodToOpenApiSchema(AgendaItemSchema),
    ListItem: zodToOpenApiSchema(ListItemSchema),
    Project: zodToOpenApiSchema(ProjectSchema),
    Tag: zodToOpenApiSchema(TagSchema),
    CreateListItemInput: zodToOpenApiSchema(CreateListItemBodySchema),
    UpdateListItemInput: zodToOpenApiSchema(UpdateListItemBodySchema),
    ListItemListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('ListItem') },
        pagination: refTo('Pagination'),
      },
    },
    ListItemResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('ListItem'),
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
