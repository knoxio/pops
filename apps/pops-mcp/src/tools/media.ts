import { getClient } from '../client.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './index.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const libraryList: ToolDef = {
  name: 'media.library.list',
  description:
    'List the media library (movies and TV shows). Filter by type, genre, or search query.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'movie', 'tv'],
        description: 'Filter by media type (default "all")',
      },
      search: { type: 'string', description: 'Search by title' },
      genre: { type: 'string', description: 'Filter by genre' },
      sort: {
        type: 'string',
        description: 'Sort order (e.g. "title", "added", "rating")',
      },
      page: { type: 'number', description: 'Page number (default 1)' },
      pageSize: { type: 'number', description: 'Items per page, max 96 (default 24)' },
    },
  },
  handler: async (args) => {
    let type: 'all' | 'movie' | 'tv' = 'all';
    if (args['type'] === 'movie' || args['type'] === 'tv') {
      type = args['type'];
    }

    const result = await getClient().media.library.list.query({
      type,
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      genre: typeof args['genre'] === 'string' ? args['genre'] : undefined,
      page: typeof args['page'] === 'number' ? args['page'] : undefined,
      pageSize: typeof args['pageSize'] === 'number' ? args['pageSize'] : undefined,
    });
    return ok(result);
  },
};

const watchlistList: ToolDef = {
  name: 'media.watchlist.list',
  description: 'List the media watchlist (movies and TV shows queued to watch).',
  inputSchema: {
    type: 'object',
    properties: {
      mediaType: {
        type: 'string',
        enum: ['movie', 'tv_show'],
        description: 'Filter by media type',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().media.watchlist.list.query({
      mediaType:
        args['mediaType'] === 'movie' || args['mediaType'] === 'tv_show'
          ? args['mediaType']
          : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
  },
};

export const mediaTools: readonly ToolDef[] = [libraryList, watchlistList];
