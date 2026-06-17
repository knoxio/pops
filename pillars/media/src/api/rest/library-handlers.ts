/**
 * Handlers for the `library.*` sub-router. Thin wrappers over the
 * `libraryService` read queries; rows are mapped to wire shapes
 * (`toLibraryItem` / `toMovie`) at this boundary.
 */
import { type MediaDb, libraryService } from '../../db/index.js';
import { toLibraryItem } from '../modules/library-types.js';
import { toMovie } from '../modules/movie-types.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaLibraryContract } from '../../contract/rest-library.js';

type Req = ServerInferRequest<typeof mediaLibraryContract>;

export function makeLibraryHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const { rows, total } = libraryService.listLibrary(db, query);
        const totalPages = Math.ceil(total / query.pageSize);
        return {
          status: 200 as const,
          body: {
            data: rows.map(toLibraryItem),
            pagination: {
              page: query.page,
              pageSize: query.pageSize,
              total,
              totalPages,
              hasMore: query.page < totalPages,
            },
          },
        };
      }),

    genres: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: libraryService.listLibraryGenres(db) },
      })),

    quickPick: ({ query }: Req['quickPick']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: libraryService.getQuickPicks(db, query.count).map(toMovie) },
      })),
  };
}
