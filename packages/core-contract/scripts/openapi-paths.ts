import {
  refTo,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiPathItem,
} from './openapi-types.js';

const PILLAR_PATH_PARAM: OpenApiParameter = {
  name: 'pillar',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const REGISTRY_QUERY_PARAMS: OpenApiParameter[] = [
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
];

const listOp: OpenApiOperation = {
  tags: ['registry'],
  summary: 'List registered pillars',
  operationId: 'core.registry.list',
  parameters: REGISTRY_QUERY_PARAMS,
  responses: {
    '200': {
      description: 'Registered pillars list',
      content: { 'application/json': { schema: refTo('RegistryEntryListResponse') } },
    },
  },
};

const registerOp: OpenApiOperation = {
  tags: ['registry'],
  summary: 'Register a pillar',
  operationId: 'core.registry.register',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('RegisterPillarInput') } },
  },
  responses: {
    '200': {
      description: 'Registered pillar entry',
      content: { 'application/json': { schema: refTo('RegistryEntryResponse') } },
    },
  },
};

const getOp: OpenApiOperation = {
  tags: ['registry'],
  summary: 'Get a registered pillar by id',
  operationId: 'core.registry.get',
  parameters: [PILLAR_PATH_PARAM],
  responses: {
    '200': {
      description: 'Registry entry',
      content: { 'application/json': { schema: refTo('RegistryEntryResponse') } },
    },
    '404': { description: 'Pillar not registered' },
  },
};

const heartbeatOp: OpenApiOperation = {
  tags: ['registry'],
  summary: 'Record a pillar heartbeat',
  parameters: [PILLAR_PATH_PARAM],
  operationId: 'core.registry.heartbeat',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('HeartbeatInput') } },
  },
  responses: {
    '200': {
      description: 'Heartbeat acknowledgement',
      content: { 'application/json': { schema: refTo('HeartbeatResponse') } },
    },
    '404': { description: 'Pillar not registered' },
  },
};

const deregisterOp: OpenApiOperation = {
  tags: ['registry'],
  summary: 'Deregister a pillar',
  operationId: 'core.registry.deregister',
  parameters: [PILLAR_PATH_PARAM],
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('DeregisterResponse') } },
    },
    '404': { description: 'Pillar not registered' },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/core/registry': { get: listOp, post: registerOp },
    '/core/registry/{pillar}': { get: getOp, delete: deregisterOp },
    '/core/registry/{pillar}/heartbeat': { post: heartbeatOp },
  };
}
