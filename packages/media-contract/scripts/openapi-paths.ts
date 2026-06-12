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

const MOVIES_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['movies'],
  summary: 'List movies',
  operationId: 'media.movies.list',
  parameters: MOVIES_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated movies list',
      content: { 'application/json': { schema: refTo('MovieListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['movies'],
  summary: 'Create a movie',
  operationId: 'media.movies.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateMovieInput') } },
  },
  responses: {
    '200': {
      description: 'Created movie',
      content: { 'application/json': { schema: refTo('MovieResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['movies'],
  summary: 'Get a movie by id',
  operationId: 'media.movies.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Movie',
      content: { 'application/json': { schema: refTo('MovieResponse') } },
    },
    '404': { description: 'Movie not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['movies'],
  summary: 'Update a movie',
  operationId: 'media.movies.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateMovieInput') } },
  },
  responses: {
    '200': {
      description: 'Updated movie',
      content: { 'application/json': { schema: refTo('MovieResponse') } },
    },
    '404': { description: 'Movie not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['movies'],
  summary: 'Delete a movie',
  operationId: 'media.movies.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'Movie not found' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/media/movies': { get: listOp, post: createOp },
    '/media/movies/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
  };
}
