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

const settingsGetOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Get a setting by key (returns null if missing)',
  operationId: 'core.settings.get',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsGetInput') } },
  },
  responses: {
    '200': {
      description: 'Setting value or null',
      content: { 'application/json': { schema: refTo('SettingsGetOutput') } },
    },
  },
};

const settingsSetOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Upsert a setting value',
  operationId: 'core.settings.set',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsSetInput') } },
  },
  responses: {
    '200': {
      description: 'Persisted setting',
      content: { 'application/json': { schema: refTo('SettingsSetOutput') } },
    },
  },
};

const settingsEnsureOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Ensure a setting exists — upsert-and-return',
  operationId: 'core.settings.ensure',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsEnsureInput') } },
  },
  responses: {
    '200': {
      description: 'Persisted setting (existing or newly inserted)',
      content: { 'application/json': { schema: refTo('SettingsEnsureOutput') } },
    },
  },
};

const settingsDeleteOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Delete a setting by key',
  operationId: 'core.settings.delete',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsDeleteInput') } },
  },
  responses: {
    '200': {
      description: 'Acknowledgement',
      content: { 'application/json': { schema: refTo('SettingsDeleteOutput') } },
    },
    '404': { description: 'Setting key not found' },
  },
};

const settingsGetManyOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Bulk read settings by key — missing keys omitted from result',
  operationId: 'core.settings.getMany',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsGetManyInput') } },
  },
  responses: {
    '200': {
      description: 'Map of present key→value',
      content: { 'application/json': { schema: refTo('SettingsGetManyOutput') } },
    },
  },
};

const settingsSetManyOp: OpenApiOperation = {
  tags: ['settings'],
  summary: 'Bulk write settings transactionally — rolls back all on any failure',
  operationId: 'core.settings.setMany',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('SettingsSetManyInput') } },
  },
  responses: {
    '200': {
      description: 'Map of persisted key→value',
      content: { 'application/json': { schema: refTo('SettingsSetManyOutput') } },
    },
  },
};

export function buildPaths(): Record<string, OpenApiPathItem> {
  return {
    '/core/registry': { get: listOp, post: registerOp },
    '/core/registry/{pillar}': { get: getOp, delete: deregisterOp },
    '/core/registry/{pillar}/heartbeat': { post: heartbeatOp },
    '/core/settings/get': { post: settingsGetOp },
    '/core/settings/set': { post: settingsSetOp },
    '/core/settings/ensure': { post: settingsEnsureOp },
    '/core/settings/delete': { post: settingsDeleteOp },
    '/core/settings/getMany': { post: settingsGetManyOp },
    '/core/settings/setMany': { post: settingsSetManyOp },
  };
}
