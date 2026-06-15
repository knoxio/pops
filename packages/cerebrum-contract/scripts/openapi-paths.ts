import { buildDebriefPaths } from './openapi-debrief-paths.js';
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

const ENGRAMS_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['engrams'],
  summary: 'List cerebrum engrams',
  operationId: 'cerebrum.engrams.list',
  parameters: ENGRAMS_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Paginated engrams list',
      content: { 'application/json': { schema: refTo('EngramListResponse') } },
    },
  },
};

const createOp: OpenApiOperation = {
  tags: ['engrams'],
  summary: 'Create a cerebrum engram',
  operationId: 'cerebrum.engrams.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('CreateEngramInput') } },
  },
  responses: {
    '200': {
      description: 'Created engram',
      content: { 'application/json': { schema: refTo('EngramResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['engrams'],
  summary: 'Get a cerebrum engram by id',
  operationId: 'cerebrum.engrams.get',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Engram',
      content: { 'application/json': { schema: refTo('EngramResponse') } },
    },
    '404': { description: 'Engram not found' },
  },
};

const updateOp: OpenApiOperation = {
  tags: ['engrams'],
  summary: 'Update a cerebrum engram',
  operationId: 'cerebrum.engrams.update',
  parameters: [ID_PATH_PARAM],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('UpdateEngramInput') } },
  },
  responses: {
    '200': {
      description: 'Updated engram',
      content: { 'application/json': { schema: refTo('EngramResponse') } },
    },
    '404': { description: 'Engram not found' },
  },
};

const deleteOp: OpenApiOperation = {
  tags: ['engrams'],
  summary: 'Delete a cerebrum engram',
  operationId: 'cerebrum.engrams.delete',
  parameters: [ID_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeleteResponse') } },
    },
    '404': { description: 'Engram not found' },
  },
};

const embeddingsStatusOp: OpenApiOperation = {
  tags: ['embeddings'],
  summary: 'Get cerebrum embeddings coverage status',
  operationId: 'cerebrum.embeddings.getStatus',
  parameters: [
    {
      name: 'sourceType',
      in: 'query',
      required: false,
      schema: { type: 'string', minLength: 1 },
    },
  ],
  responses: {
    '200': {
      description: 'Embedding coverage stats',
      content: { 'application/json': { schema: refTo('EmbeddingsGetStatusOutput') } },
    },
  },
};

const embeddingsListSourceIdsOp: OpenApiOperation = {
  tags: ['embeddings'],
  summary: 'List distinct source ids for a cerebrum embedding source type',
  operationId: 'cerebrum.embeddings.listSourceIdsByType',
  parameters: [
    {
      name: 'sourceType',
      in: 'query',
      required: true,
      schema: { type: 'string', minLength: 1 },
    },
  ],
  responses: {
    '200': {
      description: 'Distinct source ids for the given source type',
      content: {
        'application/json': { schema: refTo('EmbeddingsListSourceIdsByTypeOutput') },
      },
    },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/cerebrum/embeddings/status': { get: embeddingsStatusOp },
    '/cerebrum/embeddings/source-ids': { get: embeddingsListSourceIdsOp },
    '/cerebrum/engrams': { get: listOp, post: createOp },
    '/cerebrum/engrams/{id}': { get: getOp, patch: updateOp, delete: deleteOp },
    ...buildDebriefPaths(),
  };
}
