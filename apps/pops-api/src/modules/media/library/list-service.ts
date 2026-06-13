import { type SQL, sql } from 'drizzle-orm';

import { movies, tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type { LibraryItem, LibraryListInput, LibrarySortOption } from './types.js';

/** Map a sort option to a Drizzle SQL fragment. */
function sortClause(sort: LibrarySortOption): SQL {
  switch (sort) {
    case 'title':
      return sql`title COLLATE NOCASE ASC`;
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

function parseGenres(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

interface LibraryRawRow {
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

function moviePosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return row.poster_override_path;
  if (row.poster_path) return `/media/images/movie/${row.external_id}/poster.jpg`;
  return null;
}

function tvPosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return row.poster_override_path;
  if (row.poster_path) return `/media/images/tv/${row.external_id}/poster.jpg`;
  return null;
}

function cdnPosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return null;
  if (row.type === 'movie' && row.poster_path) return `${TMDB_IMAGE_BASE}${row.poster_path}`;
  return null;
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
  if (input.search) conditions.push(sql`title LIKE ${'%' + input.search + '%'}`);
  if (input.genre) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ${input.genre})`
    );
  }
  if (conditions.length === 0) return null;
  return conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);
}

function rowToLibraryItem(row: LibraryRawRow): LibraryItem {
  return {
    id: row.id,
    type: row.type as 'movie' | 'tv',
    title: row.title,
    year: row.release_date ? new Date(row.release_date).getFullYear() : null,
    posterUrl: row.type === 'movie' ? moviePosterUrl(row) : tvPosterUrl(row),
    cdnPosterUrl: cdnPosterUrl(row),
    genres: parseGenres(row.genres),
    voteAverage: row.vote_average,
    createdAt: row.created_at,
    releaseDate: row.release_date,
  };
}

/**
 * List all library items (movies + TV shows) with filtering, sorting, and pagination.
 * Uses a SQL UNION ALL query for efficiency.
 */
export function listLibrary(input: LibraryListInput): { items: LibraryItem[]; total: number } {
  const db = getDrizzle();
  const baseSql = libraryUnionSql();
  const whereClause = buildWhereClause(input);
  const orderBy = sortClause(input.sort);
  const limit = input.pageSize;
  const offset = (input.page - 1) * input.pageSize;
  const whereFragment = whereClause ? sql`WHERE ${whereClause}` : sql``;

  const countRow = db.all<{ total: number }>(
    sql`SELECT COUNT(*) AS total FROM (${baseSql}) AS library ${whereFragment}`
  );
  const total = countRow[0]?.total ?? 0;

  const rows = db.all<LibraryRawRow>(
    sql`SELECT * FROM (${baseSql}) AS library ${whereFragment} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`
  );

  return { items: rows.map(rowToLibraryItem), total };
}

/** Get all unique genres across movies and TV shows. */
export function listLibraryGenres(): string[] {
  const db = getDrizzle();
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
