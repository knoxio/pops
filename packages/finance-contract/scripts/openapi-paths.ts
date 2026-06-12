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

const WISHLIST_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
  {
    name: 'priority',
    in: 'query',
    required: false,
    description: 'Filter by priority. Unknown values yield an empty result set.',
    schema: { type: 'string' },
  },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['wishlist'],
  summary: 'List wish list items',
  operationId: 'finance.wishlist.list',
  parameters: WISHLIST_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated wish list',
      content: { 'application/json': { schema: refTo('WishListListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['wishlist'],
  summary: 'Create a wish list item',
  operationId: 'finance.wishlist.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateWishListItemInput') } },
  },
  responses: {
    '200': {
      description: 'Created wish list item',
      content: { 'application/json': { schema: refTo('WishListItemResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['wishlist'],
  summary: 'Get a wish list item by id',
  operationId: 'finance.wishlist.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Wish list item',
      content: { 'application/json': { schema: refTo('WishListItemResponse') } },
    },
    '404': { description: 'Wish list item not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['wishlist'],
  summary: 'Update a wish list item',
  operationId: 'finance.wishlist.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateWishListItemInput') } },
  },
  responses: {
    '200': {
      description: 'Updated wish list item',
      content: { 'application/json': { schema: refTo('WishListItemResponse') } },
    },
    '404': { description: 'Wish list item not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['wishlist'],
  summary: 'Delete a wish list item',
  operationId: 'finance.wishlist.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'Wish list item not found' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/finance/wishlist': { get: listOp, post: createOp },
    '/finance/wishlist/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
  };
}
