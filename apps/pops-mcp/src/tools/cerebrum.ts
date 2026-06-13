import { getPillar } from '../pillar-client.js';
import { mapCallResult, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

type EngramListInput = {
  search?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  status?: 'active' | 'archived';
  limit?: number;
  offset?: number;
};

type SearchInput = {
  query: string;
  mode: 'semantic' | 'structured' | 'hybrid';
  limit?: number;
};

type CerebrumShape = {
  cerebrum: {
    engrams: {
      list: (input: EngramListInput) => unknown;
      get: (input: { id: string }) => unknown;
    };
    retrieval: {
      search: (input: SearchInput) => unknown;
    };
  };
};

function cerebrum(): PillarHandle<CerebrumShape>['cerebrum'] {
  return getPillar<CerebrumShape>('cerebrum').cerebrum;
}

const engramsList: ToolDef = {
  name: 'cerebrum.engrams.list',
  description:
    'List engrams (knowledge notes) from the Cerebrum knowledge base. Filter by type, scopes, tags, status, or free-text search.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Full-text search in engram content and title' },
      type: { type: 'string', description: 'Filter by engram type (e.g. "note", "decision")' },
      scopes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by scope slugs (e.g. ["work", "personal"])',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tag names',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by status (default: active)',
      },
      limit: { type: 'number', description: 'Max results (default 50, max 500)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const scopes = Array.isArray(args['scopes'])
      ? (args['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : undefined;
    const tags = Array.isArray(args['tags'])
      ? (args['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
      : undefined;

    const input: EngramListInput = {};
    if (typeof args['search'] === 'string') input.search = args['search'];
    if (typeof args['type'] === 'string') input.type = args['type'];
    if (scopes !== undefined) input.scopes = scopes;
    if (tags !== undefined) input.tags = tags;
    if (args['status'] === 'active' || args['status'] === 'archived') input.status = args['status'];
    if (typeof args['limit'] === 'number') input.limit = args['limit'];
    if (typeof args['offset'] === 'number') input.offset = args['offset'];

    return mapCallResult(await cerebrum().engrams.list(input));
  },
};

const engramGet: ToolDef = {
  name: 'cerebrum.engrams.get',
  description: 'Read a single engram by ID. Returns full metadata and body content.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Engram ID' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    if (typeof args['id'] !== 'string' || args['id'].length === 0) {
      return toolError('Invalid "id"');
    }
    return mapCallResult(await cerebrum().engrams.get({ id: args['id'] }));
  },
};

const cerebrumSearch: ToolDef = {
  name: 'cerebrum.search',
  description:
    'Search the Cerebrum knowledge base using hybrid semantic + structured search. Returns ranked results with titles, scores, scopes, and content snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (required for semantic/hybrid modes)' },
      mode: {
        type: 'string',
        enum: ['semantic', 'structured', 'hybrid'],
        description: 'Search mode (default: hybrid)',
      },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    if (typeof args['query'] !== 'string' || args['query'].trim().length === 0) {
      return toolError('Invalid "query"');
    }
    const mode: 'semantic' | 'structured' | 'hybrid' =
      args['mode'] === 'semantic' || args['mode'] === 'structured' || args['mode'] === 'hybrid'
        ? args['mode']
        : 'hybrid';
    const input: SearchInput = { query: args['query'], mode };
    if (typeof args['limit'] === 'number') input.limit = args['limit'];
    return mapCallResult(await cerebrum().retrieval.search(input));
  },
};

export const cerebrumTools: readonly ToolDef[] = [engramsList, engramGet, cerebrumSearch];
