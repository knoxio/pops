import { getPillar } from '../pillar-client.js';
import { mapCallResult } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

type LibraryListInput = {
  type: 'all' | 'movie' | 'tv';
  search?: string;
  genre?: string;
  page?: number;
  pageSize?: number;
};

type WatchlistListInput = {
  mediaType?: 'movie' | 'tv_show';
  limit?: number;
  offset?: number;
};

type MediaShape = {
  media: {
    library: {
      list: (input: LibraryListInput) => unknown;
    };
    watchlist: {
      list: (input: WatchlistListInput) => unknown;
    };
  };
};

function media(): PillarHandle<MediaShape>['media'] {
  return getPillar<MediaShape>('media').media;
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
    const type: 'all' | 'movie' | 'tv' =
      args['type'] === 'movie' || args['type'] === 'tv' ? args['type'] : 'all';

    const input: LibraryListInput = { type };
    if (typeof args['search'] === 'string') input.search = args['search'];
    if (typeof args['genre'] === 'string') input.genre = args['genre'];
    if (typeof args['page'] === 'number') input.page = args['page'];
    if (typeof args['pageSize'] === 'number') input.pageSize = args['pageSize'];

    return mapCallResult(await media().library.list(input));
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
    const input: WatchlistListInput = {};
    if (args['mediaType'] === 'movie' || args['mediaType'] === 'tv_show') {
      input.mediaType = args['mediaType'];
    }
    if (typeof args['limit'] === 'number') input.limit = args['limit'];
    if (typeof args['offset'] === 'number') input.offset = args['offset'];

    return mapCallResult(await media().watchlist.list(input));
  },
};

export const mediaTools: readonly ToolDef[] = [libraryList, watchlistList];
