import { refTo, type OpenApiOperation, type OpenApiPathItem } from './openapi-types.js';

const debriefRecordOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Record a debrief result for a session/dimension',
  operationId: 'cerebrum.debrief.record',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('DebriefRecordInput') } },
  },
  responses: {
    '200': {
      description: 'Recorded debrief result',
      content: { 'application/json': { schema: refTo('DebriefResultResponse') } },
    },
  },
};

const debriefDismissOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Dismiss a debrief session (idempotent)',
  operationId: 'cerebrum.debrief.dismiss',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('DebriefDismissInput') } },
  },
  responses: {
    '200': {
      description: 'Dismissed debrief session',
      content: { 'application/json': { schema: refTo('DebriefSessionResponse') } },
    },
  },
};

const debriefListPendingOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'List pending debrief sessions',
  operationId: 'cerebrum.debrief.listPending',
  parameters: [
    { name: 'mediaType', in: 'query', required: false, schema: refTo('DebriefMediaType') },
    { name: 'mediaId', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
  ],
  responses: {
    '200': {
      description: 'Pending debrief sessions',
      content: { 'application/json': { schema: refTo('DebriefSessionListResponse') } },
    },
  },
};

const debriefCreateOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Create a debrief session pinned to a watch_history row',
  operationId: 'cerebrum.debrief.create',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('DebriefCreateInput') } },
  },
  responses: {
    '200': {
      description: 'Created debrief session',
      content: { 'application/json': { schema: refTo('DebriefSessionResponse') } },
    },
  },
};

const debriefGetOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Get a debrief session by id',
  operationId: 'cerebrum.debrief.get',
  parameters: [
    { name: 'sessionId', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } },
  ],
  responses: {
    '200': {
      description: 'Debrief session or null',
      content: { 'application/json': { schema: refTo('DebriefSessionNullableResponse') } },
    },
  },
};

const debriefGetByMediaOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Get the latest debrief session for a media tuple (denormalised)',
  operationId: 'cerebrum.debrief.getByMedia',
  parameters: [
    { name: 'mediaType', in: 'query', required: true, schema: refTo('DebriefMediaType') },
    { name: 'mediaId', in: 'query', required: true, schema: { type: 'integer', minimum: 1 } },
  ],
  responses: {
    '200': {
      description: 'Latest debrief session for the media tuple, or null',
      content: { 'application/json': { schema: refTo('DebriefSessionNullableResponse') } },
    },
  },
};

const debriefLogWatchCompletionOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Log a watch completion (Option D entry point)',
  operationId: 'cerebrum.debrief.logWatchCompletion',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: refTo('DebriefLogWatchCompletionInput') } },
  },
  responses: {
    '200': {
      description: 'Debrief fan-out result',
      content: { 'application/json': { schema: refTo('DebriefLogWatchCompletionResponse') } },
    },
  },
};

const debriefDeleteByWatchHistoryIdOp: OpenApiOperation = {
  tags: ['debrief'],
  summary: 'Cascade-delete debrief rows pinned to a watch_history id',
  operationId: 'cerebrum.debrief.deleteByWatchHistoryId',
  requestBody: {
    required: true,
    content: {
      'application/json': { schema: refTo('DebriefDeleteByWatchHistoryIdInput') },
    },
  },
  responses: {
    '200': {
      description: 'Cascade deletion counts',
      content: {
        'application/json': { schema: refTo('DebriefDeleteByWatchHistoryIdResponse') },
      },
    },
  },
};

export function buildDebriefPaths(): Record<string, OpenApiPathItem> {
  return {
    '/cerebrum/debrief/record': { post: debriefRecordOp },
    '/cerebrum/debrief/dismiss': { post: debriefDismissOp },
    '/cerebrum/debrief/listPending': { get: debriefListPendingOp },
    '/cerebrum/debrief/create': { post: debriefCreateOp },
    '/cerebrum/debrief/get': { get: debriefGetOp },
    '/cerebrum/debrief/getByMedia': { get: debriefGetByMediaOp },
    '/cerebrum/debrief/logWatchCompletion': { post: debriefLogWatchCompletionOp },
    '/cerebrum/debrief/deleteByWatchHistoryId': { post: debriefDeleteByWatchHistoryIdOp },
  };
}
