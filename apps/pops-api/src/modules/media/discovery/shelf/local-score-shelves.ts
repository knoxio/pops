import { and, eq, sql } from 'drizzle-orm';

import { comparisonDimensions, mediaScores, movies } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { movieCols, toResult } from './local-shelves-helpers.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

export const polarizingShelf: ShelfDefinition = {
  id: 'polarizing',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'polarizing',
        title: 'Polarizing Picks',
        subtitle: 'Movies that split opinion across dimensions',
        emoji: '⚡',
        score: 0.5,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const rows = db
            .select({
              ...movieCols,
              scoreRange: sql<number>`ROUND(MAX(${mediaScores.score}) - MIN(${mediaScores.score}), 1)`,
            })
            .from(movies)
            .innerJoin(
              mediaScores,
              and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
            )
            .groupBy(movies.id)
            .having(sql`MAX(${mediaScores.score}) - MIN(${mediaScores.score}) > 200`)
            .orderBy(sql`MAX(${mediaScores.score}) - MIN(${mediaScores.score}) DESC`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(rows.map((r) => ({ ...toResult(r), isWatched: true })));
        },
      },
    ];
  },
};

export const friendProofShelf: ShelfDefinition = {
  id: 'friend-proof',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'friend-proof',
        title: 'Friend-Proof',
        subtitle: 'High entertainment value for any crowd',
        emoji: '🍿',
        score: 0.75,
        query: ({ limit, offset }) => {
          const db = getDrizzle();
          const allScored = db
            .select({
              ...movieCols,
              avgFriendScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
            })
            .from(movies)
            .innerJoin(
              mediaScores,
              and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
            )
            .innerJoin(
              comparisonDimensions,
              and(
                eq(comparisonDimensions.id, mediaScores.dimensionId),
                sql`${comparisonDimensions.name} IN ('Entertainment', 'Rewatchability')`
              )
            )
            .groupBy(movies.id)
            .having(sql`COUNT(DISTINCT ${comparisonDimensions.name}) = 2`)
            .orderBy(sql`AVG(${mediaScores.score}) DESC`)
            .all();

          const sorted = [...allScored].toSorted((a, b) => a.avgFriendScore - b.avgFriendScore);
          const p75Index = Math.floor(sorted.length * 0.75);
          const threshold = sorted[p75Index]?.avgFriendScore ?? 1500;
          const filtered = allScored.filter((r) => r.avgFriendScore >= threshold);
          return Promise.resolve(
            filtered.slice(offset, offset + limit).map((r) => ({ ...toResult(r), isWatched: true }))
          );
        },
      },
    ];
  },
};

registerShelf(polarizingShelf);
registerShelf(friendProofShelf);
