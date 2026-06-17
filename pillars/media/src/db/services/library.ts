/**
 * Library read queries against the media pillar's SQLite.
 *
 * Lifted from the pops-api monolith `library/list-service.ts` +
 * `service.ts` (getQuickPicks) and converted to the pillar's `(db, …)`
 * arg-passing pattern. Read-only: the library add/refresh mutations stay in
 * the monolith until the TMDB/TheTVDB clients land in the pillar (wave 2).
 *
 * The list endpoint unions movies + tv_shows into a single paginated grid;
 * the raw row shape is mapped to the `LibraryItem` wire shape at the handler
 * boundary so this layer stays HTTP-free.
 */
import { type SQL, sql } from 'drizzle-orm';

import { movies, tvShows, watchHistory } from '../schema.js';

import type { MediaDb } from './internal.js';
import type { MovieRow } from './movies.js';

export type LibraryType = 'all' | 'movie' | 'tv';
export type LibrarySortOption = 'title' | 'dateAdded' | 'releaseDate' | 'rating';

export interface LibraryListInput {
  type: LibraryType;
  sort: LibrarySortOption;
  search?: string;
  genre?: string;
  page: number;
  pageSize: number;
}

export interface LibraryRawRow {
  id: number;
  type: string;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  poster_override_path: string | null;
  external_id: number;
  vote_average: number | null;
  genres: string | null;
  created_at: string;
}

export interface LibraryListResult {
  rows: LibraryRawRow[];
  total: number;
}

function sortClause(sort: LibrarySortOption): SQL {
  switch (sort) {
    case 'dateAdded':
      return sql`created_at DESC`;
    case 'releaseDate':
      return sql`release_date DESC`;
    case 'rating':
      return sql`vote_average DESC`;
    default:
      return sql`title COLLATE NOCASE ASC`;
  }
}

function libraryUnionSql(): SQL {
  return sql`
    SELECT ${movies.id} AS id, 'movie' AS type, ${movies.title} AS title,
           ${movies.releaseDate} AS release_date, ${movies.posterPath} AS poster_path,
           ${movies.posterOverridePath} AS poster_override_path,
           ${movies.tmdbId} AS external_id, ${movies.voteAverage} AS vote_average,
           ${movies.genres} AS genres, ${movies.createdAt} AS created_at
    FROM ${movies}
    UNION ALL
    SELECT ${tvShows.id} AS id, 'tv' AS type, ${tvShows.name} AS title,
           ${tvShows.firstAirDate} AS release_date, ${tvShows.posterPath} AS poster_path,
           ${tvShows.posterOverridePath} AS poster_override_path,
           ${tvShows.tvdbId} AS external_id, ${tvShows.voteAverage} AS vote_average,
           ${tvShows.genres} AS genres, ${tvShows.createdAt} AS created_at
    FROM ${tvShows}
  `;
}

function buildWhereClause(input: LibraryListInput): SQL | null {
  const conditions: SQL[] = [];
  if (input.type !== 'all') conditions.push(sql`type = ${input.type}`);
  if (input.search) conditions.push(sql`title LIKE ${`%${input.search}%`}`);
  if (input.genre) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ${input.genre})`
    );
  }
  if (conditions.length === 0) return null;
  return conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);
}

/** List movies + TV shows as a single paginated grid via a UNION ALL query. */
export function listLibrary(db: MediaDb, input: LibraryListInput): LibraryListResult {
  const baseSql = libraryUnionSql();
  const whereClause = buildWhereClause(input);
  const whereFragment = whereClause ? sql`WHERE ${whereClause}` : sql``;
  const orderBy = sortClause(input.sort);
  const limit = input.pageSize;
  const offset = (input.page - 1) * input.pageSize;

  const countRow = db.all<{ total: number }>(
    sql`SELECT COUNT(*) AS total FROM (${baseSql}) AS library ${whereFragment}`
  );
  const total = countRow[0]?.total ?? 0;

  const rows = db.all<LibraryRawRow>(
    sql`SELECT * FROM (${baseSql}) AS library ${whereFragment} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`
  );

  return { rows, total };
}

/** Distinct genres across movies + TV shows, case-insensitively sorted. */
export function listLibraryGenres(db: MediaDb): string[] {
  const rows = db.all<{ genre: string }>(sql`
    SELECT DISTINCT je.value AS genre
    FROM (
      SELECT ${movies.genres} AS genres FROM ${movies}
      UNION ALL
      SELECT ${tvShows.genres} AS genres FROM ${tvShows}
    ) AS combined, json_each(combined.genres) AS je
    WHERE je.value IS NOT NULL
    ORDER BY je.value COLLATE NOCASE
  `);
  return rows.map((r) => r.genre);
}

/** Random movies with no completed watch-history entry (a "quick pick" queue). */
export function getQuickPicks(db: MediaDb, count: number): MovieRow[] {
  return db
    .select()
    .from(movies)
    .where(
      sql`${movies.id} NOT IN (
        SELECT DISTINCT ${watchHistory.mediaId}
        FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
          AND ${watchHistory.completed} = 1
      )`
    )
    .orderBy(sql`RANDOM()`)
    .limit(count)
    .all();
}
