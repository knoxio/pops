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
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'List lists items',
  operationId: 'lists.items.list',
  parameters: ITEMS_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated items list',
      content: { 'application/json': { schema: refTo('ListItemListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Create a lists item',
  operationId: 'lists.items.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateListItemInput') } },
  },
  responses: {
    '200': {
      description: 'Created item',
      content: { 'application/json': { schema: refTo('ListItemResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Get a lists item by id',
  operationId: 'lists.items.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'List item',
      content: { 'application/json': { schema: refTo('ListItemResponse') } },
    },
    '404': { description: 'List item not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Update a lists item',
  operationId: 'lists.items.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateListItemInput') } },
  },
  responses: {
    '200': {
      description: 'Updated item',
      content: { 'application/json': { schema: refTo('ListItemResponse') } },
    },
    '404': { description: 'List item not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['items'],
  summary: 'Delete a lists item',
  operationId: 'lists.items.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'List item not found' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/lists/items': { get: listOp, post: createOp },
    '/lists/items/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
  };
}
