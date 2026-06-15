import {
  refTo,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiPathItem,
} from './openapi-types.js';

const ID_PATH_PARAM: OpenApiParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const ITEMS_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'location', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'List inventory items',
  operationId: 'inventory.items.list',
  parameters: ITEMS_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated items list',
      content: { 'application/json': { schema: refTo('ItemListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Create an inventory item',
  operationId: 'inventory.items.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateItemInput') } },
  },
  responses: {
    '200': {
      description: 'Created item',
      content: { 'application/json': { schema: refTo('ItemResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Get an inventory item by id',
  operationId: 'inventory.items.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Item',
      content: { 'application/json': { schema: refTo('ItemResponse') } },
    },
    '404': { description: 'Item not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Update an inventory item',
  operationId: 'inventory.items.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateItemInput') } },
  },
  responses: {
    '200': {
      description: 'Updated item',
      content: { 'application/json': { schema: refTo('ItemResponse') } },
    },
    '404': { description: 'Item not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Delete an inventory item',
  operationId: 'inventory.items.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'Item not found' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/inventory/items': { get: listOp, post: createOp },
    '/inventory/items/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
  };
}
