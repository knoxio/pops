import { and, eq, sql } from 'drizzle-orm';

import { mediaScores, movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { movieCols, toResult } from './local-shelves-helpers.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

export const comfortPicksShelf: ShelfDefinition = {
  id: 'comfort-picks',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'comfort-picks',
        title: 'Comfort Picks',
        subtitle: 'Your most-rewatched movies',
        emoji: '🛋️',
        score: 0.7,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select({
              ...movieCols,
              watchCount: sql<number>`COUNT(${watchHistory.id})`,
            })
            .from(movies)
            .innerJoin(
              watchHistory,
              and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.mediaId, movies.id))
            )
            .groupBy(movies.id)
            .having(sql`COUNT(${watchHistory.id}) >= 2`)
            .orderBy(sql`COUNT(${watchHistory.id}) DESC`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map((r) => ({ ...toResult(r), isWatched: true })));
        },
      },
    ];
  },
};

export const undiscoveredShelf: ShelfDefinition = {
  id: 'undiscovered',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'undiscovered',
        title: 'Undiscovered',
        subtitle: "Library movies you've never touched",
        emoji: '🔍',
        score: 0.65,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select(movieCols)
            .from(movies)
            .where(
              sql`NOT EXISTS (
                SELECT 1 FROM ${watchHistory}
                WHERE ${watchHistory.mediaType} = 'movie'
                AND ${watchHistory.mediaId} = ${movies.id}
              )
              AND NOT EXISTS (
                SELECT 1 FROM ${mediaScores}
                WHERE ${mediaScores.mediaType} = 'movie'
                AND ${mediaScores.mediaId} = ${movies.id}
              )`
            )
            .orderBy(sql`${movies.createdAt} DESC`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map(toResult));
        },
      },
    ];
  },
};

export const recentlyAddedShelf: ShelfDefinition = {
  id: 'recently-added',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'recently-added',
        title: 'Recently Added',
        subtitle: 'New to your library',
        emoji: '✨',
        score: 0.8,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select(movieCols)
            .from(movies)
            .where(
              sql`NOT EXISTS (
                SELECT 1 FROM ${watchHistory}
                WHERE ${watchHistory.mediaType} = 'movie'
                AND ${watchHistory.mediaId} = ${movies.id}
              )`
            )
            .orderBy(sql`${movies.createdAt} DESC`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map(toResult));
        },
      },
    ];
  },
};

registerShelf(comfortPicksShelf);
registerShelf(undiscoveredShelf);
registerShelf(recentlyAddedShelf);
