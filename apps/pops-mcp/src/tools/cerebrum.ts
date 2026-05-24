import { getClient } from '../client.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './index.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
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

    const result = await getClient().cerebrum.engrams.list.query({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      type: typeof args['type'] === 'string' ? args['type'] : undefined,
      scopes,
      tags,
      status:
        args['status'] === 'active' || args['status'] === 'archived' ? args['status'] : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
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
    const result = await getClient().cerebrum.engrams.get.query({ id: String(args['id']) });
    return ok(result);
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
    const result = await getClient().cerebrum.retrieval.search.query({
      query: typeof args['query'] === 'string' ? args['query'] : '',
      mode:
        args['mode'] === 'semantic' || args['mode'] === 'structured' || args['mode'] === 'hybrid'
          ? args['mode']
          : 'hybrid',
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
    });
    return ok(result);
  },
};

export const cerebrumTools: readonly ToolDef[] = [engramsList, engramGet, cerebrumSearch];
