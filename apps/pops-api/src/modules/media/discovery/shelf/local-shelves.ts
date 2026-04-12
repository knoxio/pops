/**
 * Local library shelf implementations (8 types).
 *
 * All shelves in this module query only the local SQLite database — no TMDB API
 * calls. Each shelf has category='local' and template=false (one static instance
 * per shelf type).
 *
 * Shelves:
 *   short-watch       — unwatched movies with runtime < 100 min
 *   long-epic         — unwatched movies with runtime > 150 min
 *   comfort-picks     — movies watched 2+ times
 *   undiscovered      — library movies with no watches and no comparisons
 *   polarizing        — movies with MAX–MIN ELO spread > 200 across dimensions
 *   friend-proof      — movies above 75th percentile in Entertainment + Rewatchability
 *   recently-added    — newest library additions, unwatched
 *   franchise-completions — unwatched library movies in genres of watched movies
 *                         (approximation; proper impl needs belongs_to_collection column)
 */
import { comparisonDimensions, mediaScores, movies, watchHistory } from '@pops/db-types';
import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

import { getDrizzle } from '../../../../db.js';
import type { DiscoverResult, PreferenceProfile } from '../types.js';
import { registerShelf } from './registry.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a poster URL for a library movie. */
function posterUrl(tmdbId: number, posterPath: string | null): string | null {
  if (!posterPath) return null;
  return `/media/images/movie/${tmdbId}/poster.jpg`;
}

/** Map a raw movie row to a DiscoverResult. */
function toResult(row: {
  id: number;
  tmdbId: number;
  title: string;
  overview: string | null;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string | null;
}): DiscoverResult {
  return {
    tmdbId: row.tmdbId,
    title: row.title,
    overview: row.overview ?? '',
    releaseDate: row.releaseDate ?? '',
    posterPath: row.posterPath,
    posterUrl: posterUrl(row.tmdbId, row.posterPath),
    backdropPath: row.backdropPath,
    voteAverage: row.voteAverage ?? 0,
    voteCount: row.voteCount ?? 0,
    genreIds: (() => {
      try {
        return JSON.parse(row.genres ?? '[]') as number[];
      } catch {
        return [];
      }
    })(),
    popularity: 0,
    inLibrary: true,
    isWatched: false, // all local shelf items are unwatched (unless comfort-picks)
    onWatchlist: false,
  };
}

/** Common movie columns for select. */
const movieCols = {
  id: movies.id,
  tmdbId: movies.tmdbId,
  title: movies.title,
  overview: movies.overview,
  releaseDate: movies.releaseDate,
  posterPath: movies.posterPath,
  backdropPath: movies.backdropPath,
  voteAverage: movies.voteAverage,
  voteCount: movies.voteCount,
  genres: movies.genres,
};

// ---------------------------------------------------------------------------
// short-watch: unwatched library movies with runtime < 100 min
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// long-epic: unwatched library movies with runtime > 150 min
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// comfort-picks: movies watched 2+ times
// ---------------------------------------------------------------------------

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
          return Promise.resolve(
            rows.map((r) => ({
              ...toResult(r),
              isWatched: true,
            }))
          );
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// undiscovered: in library, never watched, zero comparisons
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// polarizing: movies with MAX-MIN ELO spread > 200 across dimensions
// ---------------------------------------------------------------------------

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
          return Promise.resolve(
            rows.map((r) => ({
              ...toResult(r),
              isWatched: true, // must have scores to be polarizing
            }))
          );
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// friend-proof: high Entertainment + Rewatchability (75th percentile)
// ---------------------------------------------------------------------------

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

          // Get all movies with scores in both Entertainment and Rewatchability,
          // compute 75th percentile threshold in JS (SQLite lacks PERCENTILE_CONT).
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

          // Compute 75th percentile threshold from the score distribution
          const sorted = [...allScored].sort((a, b) => a.avgFriendScore - b.avgFriendScore);
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

// ---------------------------------------------------------------------------
// recently-added: newest library additions, unwatched
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// franchise-completions: unwatched movies in same genres as watched movies
//
// NOTE: This is an approximation. The proper implementation would use a
// belongs_to_collection column (e.g. TMDB collection_id) to group movies by
// franchise and identify partially-watched collections. Until that column is
// added to the movies schema, we approximate by finding unwatched library
// movies that share a genre with at least one watched movie.
// ---------------------------------------------------------------------------

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
          const db = getDrizzle();

          // Find genres of watched movies
          const watchedRows = db
            .select({ genres: movies.genres })
            .from(movies)
            .innerJoin(
              watchHistory,
              and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.mediaId, movies.id))
            )
            .where(isNotNull(movies.genres))
            .all();

          // Extract unique genre names from watched movies
          const watchedGenres = new Set<string>();
          for (const row of watchedRows) {
            if (!row.genres) continue;
            try {
              const genres = JSON.parse(row.genres) as string[];
              for (const g of genres) watchedGenres.add(g);
            } catch {
              // skip invalid JSON
            }
          }

          if (watchedGenres.size === 0) return Promise.resolve([]);

          // Find unwatched library movies whose genres overlap with watched genres
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
            .limit(limit * 5) // over-fetch to filter by genre overlap
            .offset(0)
            .all();

          const genreSet = watchedGenres;
          const filtered = rows.filter((r) => {
            if (!r.genres) return false;
            try {
              const genres = JSON.parse(r.genres) as string[];
              return genres.some((g) => genreSet.has(g));
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

// ---------------------------------------------------------------------------
// Register all shelves on module load
// ---------------------------------------------------------------------------

registerShelf(shortWatchShelf);
registerShelf(longEpicShelf);
registerShelf(comfortPicksShelf);
registerShelf(undiscoveredShelf);
registerShelf(polarizingShelf);
registerShelf(friendProofShelf);
registerShelf(recentlyAddedShelf);
registerShelf(franchiseCompletionsShelf);
