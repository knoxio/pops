import { z } from 'zod';

import { BudgetPeriodSchema, BudgetSchema } from '../src/schemas/budget.js';
import { EntitySchema } from '../src/schemas/entity.js';
import { TransactionSchema } from '../src/schemas/transaction.js';
import { WishListItemSchema, WishListPrioritySchema } from '../src/schemas/wish-list-item.js';
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

const CreateWishListItemBodySchema = z.object({
  item: z.string().min(1),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: WishListPrioritySchema.nullable().optional(),
  url: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateWishListItemBodySchema = CreateWishListItemBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Transaction: zodToOpenApiSchema(TransactionSchema),
    Budget: zodToOpenApiSchema(BudgetSchema),
    BudgetPeriod: zodToOpenApiSchema(BudgetPeriodSchema),
    Entity: zodToOpenApiSchema(EntitySchema),
    WishListPriority: zodToOpenApiSchema(WishListPrioritySchema),
    WishListItem: zodToOpenApiSchema(WishListItemSchema),
    CreateWishListItemInput: zodToOpenApiSchema(CreateWishListItemBodySchema),
    UpdateWishListItemInput: zodToOpenApiSchema(UpdateWishListItemBodySchema),
    WishListListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('WishListItem') },
        pagination: refTo('Pagination'),
      },
    },
    WishListItemResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('WishListItem'),
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
