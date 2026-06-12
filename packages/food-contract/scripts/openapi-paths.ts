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

const RECIPES_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['recipes'],
  summary: 'List food recipes',
  operationId: 'food.recipes.list',
  parameters: RECIPES_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated recipes list',
      content: { 'application/json': { schema: refTo('RecipeListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['recipes'],
  summary: 'Create a food recipe',
  operationId: 'food.recipes.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateRecipeInput') } },
  },
  responses: {
    '200': {
      description: 'Created recipe',
      content: { 'application/json': { schema: refTo('RecipeResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['recipes'],
  summary: 'Get a food recipe by id',
  operationId: 'food.recipes.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Recipe',
      content: { 'application/json': { schema: refTo('RecipeResponse') } },
    },
    '404': { description: 'Recipe not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['recipes'],
  summary: 'Update a food recipe',
  operationId: 'food.recipes.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateRecipeInput') } },
  },
  responses: {
    '200': {
      description: 'Updated recipe',
      content: { 'application/json': { schema: refTo('RecipeResponse') } },
    },
    '404': { description: 'Recipe not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['recipes'],
  summary: 'Delete a food recipe',
  operationId: 'food.recipes.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'Recipe not found' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/food/recipes': { get: listOp, post: createOp },
    '/food/recipes/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
  };
}
