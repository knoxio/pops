import { and, gt, isNotNull, lt, sql } from 'drizzle-orm';

import { movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { movieCols, toResult } from './local-shelves-helpers.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

export const shortWatchShelf: ShelfDefinition = {
  id: 'short-watch',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'short-watch',
        title: 'Short Watches',
        subtitle: 'Under 100 minutes, no commitment',
        emoji: '⚡',
        score: 0.6,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select(movieCols)
            .from(movies)
            .where(
              and(
                isNotNull(movies.runtime),
                lt(movies.runtime, 100),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${watchHistory}
                  WHERE ${watchHistory.mediaType} = 'movie'
                  AND ${watchHistory.mediaId} = ${movies.id}
                )`
              )
            )
            .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map(toResult));
        },
      },
    ];
  },
};

export const longEpicShelf: ShelfDefinition = {
  id: 'long-epic',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'long-epic',
        title: 'Epic Watches',
        subtitle: '150+ minutes — set aside an evening',
        emoji: '🎞️',
        score: 0.55,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select(movieCols)
            .from(movies)
            .where(
              and(
                isNotNull(movies.runtime),
                gt(movies.runtime, 150),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${watchHistory}
                  WHERE ${watchHistory.mediaType} = 'movie'
                  AND ${watchHistory.mediaId} = ${movies.id}
                )`
              )
            )
            .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map(toResult));
        },
      },
    ];
  },
};

registerShelf(shortWatchShelf);
registerShelf(longEpicShelf);
