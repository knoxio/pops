import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { movieCols, toResult } from './local-shelves-helpers.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

function fetchWatchedGenres(): Set<string> {
  const db = getDrizzle();
  const watchedRows = db
    .select({ genres: movies.genres })
    .from(movies)
    .innerJoin(
      watchHistory,
      and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.mediaId, movies.id))
    )
    .where(isNotNull(movies.genres))
    .all();

  const watchedGenres = new Set<string>();
  for (const row of watchedRows) {
    if (!row.genres) continue;
    try {
      const genres = JSON.parse(row.genres) as string[];
      for (const g of genres) watchedGenres.add(g);
    } catch {
      continue;
    }
  }
  return watchedGenres;
}

export const franchiseCompletionsShelf: ShelfDefinition = {
  id: 'franchise-completions',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'franchise-completions',
        title: 'Complete the Series',
        subtitle: "More movies in genres you've watched",
        emoji: '🔗',
        score: 0.6,
        query: ({ limit, offset }) => {
          const watchedGenres = fetchWatchedGenres();
          if (watchedGenres.size === 0) return Promise.resolve([]);

          const db = getDrizzle();
          const rows = db
            .select(movieCols)
            .from(movies)
            .where(
              and(
                isNotNull(movies.genres),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${watchHistory}
                  WHERE ${watchHistory.mediaType} = 'movie'
                  AND ${watchHistory.mediaId} = ${movies.id}
                )`
              )
            )
            .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
            .limit(limit * 5)
            .offset(0)
            .all();

          const filtered = rows.filter((r) => {
            if (!r.genres) return false;
            try {
              const genres = JSON.parse(r.genres) as string[];
              return genres.some((g) => watchedGenres.has(g));
            } catch {
              return false;
            }
          });

          return Promise.resolve(filtered.slice(offset, offset + limit).map(toResult));
        },
      },
    ];
  },
};

export const leavingSoonShelf: ShelfDefinition = {
  id: 'leaving-soon',
  template: false,
  category: 'local',
  pinned: true,
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    const db = getDrizzle();
    const count = db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.rotationStatus, 'leaving'))
      .limit(1)
      .all();

    if (count.length === 0) return [];

    return [
      {
        shelfId: 'leaving-soon',
        title: 'Leaving Soon',
        subtitle: 'Watch before they go',
        emoji: '⏳',
        score: 0.95,
        query: ({ limit, offset }) => {
          const inner = getDrizzle();
          const rows = inner
            .select({
              ...movieCols,
              rotationExpiresAt: movies.rotationExpiresAt,
            })
            .from(movies)
            .where(eq(movies.rotationStatus, 'leaving'))
            .orderBy(sql`${movies.rotationExpiresAt} ASC NULLS LAST`)
            .limit(limit)
            .offset(offset)
            .all();
          return Promise.resolve(
            rows.map((r) => ({
              ...toResult(r),
              inLibrary: true,
              rotationExpiresAt: r.rotationExpiresAt ?? undefined,
            }))
          );
        },
      },
    ];
  },
};

registerShelf(franchiseCompletionsShelf);
registerShelf(leavingSoonShelf);
