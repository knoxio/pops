/**
 * Library service — orchestrates adding media to the local library
 * by fetching metadata from external APIs and inserting records.
 */
import { sql, type SQL } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies, tvShows, watchHistory } from "@pops/db-types";
import type { TmdbClient } from "../tmdb/client.js";
import type { ImageCacheService } from "../tmdb/image-cache.js";
import type { TmdbMovieDetail } from "../tmdb/types.js";
import { getMovieByTmdbId, getMovie, createMovie, updateMovie } from "../movies/service.js";
import { toMovie } from "../movies/types.js";
import type { Movie, UpdateMovieInput } from "../movies/types.js";
import type { MovieRow } from "@pops/db-types";
import type { LibraryListInput, LibraryItem, LibrarySortOption } from "./types.js";

/**
 * Add a movie to the library by TMDB ID.
 *
 * Idempotent: returns the existing record if the movie is already in the library.
 * Fetches full detail from TMDB, maps fields, inserts a new record,
 * and downloads poster/backdrop images to the local cache.
 */
export async function addMovie(
  tmdbId: number,
  tmdbClient: TmdbClient,
  imageCache: ImageCacheService
): Promise<{ movie: Movie; created: boolean }> {
  // Idempotency: return existing if already in library
  const existing = getMovieByTmdbId(tmdbId);
  if (existing) {
    return { movie: toMovie(existing), created: false };
  }

  // Fetch full detail from TMDB
  const detail = await tmdbClient.getMovie(tmdbId);

  // Map TMDB detail to our CreateMovieInput
  const row = createMovie({
    tmdbId: detail.tmdbId,
    imdbId: detail.imdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    releaseDate: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    posterPath: detail.posterPath ? `/media/images/movie/${detail.tmdbId}/poster.jpg` : null,
    backdropPath: detail.backdropPath ? `/media/images/movie/${detail.tmdbId}/backdrop.jpg` : null,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  });

  // Download images to local cache (failures are logged, not thrown)
  await imageCache.downloadMovieImages(detail.tmdbId, detail.posterPath, detail.backdropPath, null);

  return { movie: toMovie(row), created: true };
}

/** Map a TMDB movie detail response to an update input, preserving poster_override_path. */
function mapTmdbDetailToUpdate(detail: TmdbMovieDetail): UpdateMovieInput {
  return {
    imdbId: detail.imdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    releaseDate: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    posterPath: detail.posterPath ? `/media/images/movie/${detail.tmdbId}/poster.jpg` : null,
    backdropPath: detail.backdropPath ? `/media/images/movie/${detail.tmdbId}/backdrop.jpg` : null,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
    // NOTE: posterOverridePath is intentionally omitted to preserve user overrides
  };
}

/**
 * Refresh movie metadata from TMDB.
 *
 * Fetches fresh detail from TMDB and updates the local record.
 * Preserves poster_override_path (user-uploaded override).
 * When redownloadImages is true, deletes and re-downloads cached images.
 */
export async function refreshMovie(
  id: number,
  tmdbClient: TmdbClient,
  imageCache: ImageCacheService,
  redownloadImages = false
): Promise<MovieRow> {
  // Get existing movie (throws NotFoundError if missing)
  const existing = getMovie(id);

  // Fetch fresh detail from TMDB
  const detail = await tmdbClient.getMovie(existing.tmdbId);

  // Map TMDB detail to update input (preserves poster_override_path)
  const updateInput = mapTmdbDetailToUpdate(detail);

  // Update the local record
  const updated = updateMovie(id, updateInput);

  // Re-download images if requested
  if (redownloadImages) {
    await imageCache.deleteMovieImages(existing.tmdbId);
    await imageCache.downloadMovieImages(
      existing.tmdbId,
      detail.posterPath,
      detail.backdropPath,
      null
    );
  }

  return updated;
}

/** Map a sort option to a Drizzle SQL fragment. */
function sortClause(sort: LibrarySortOption): SQL {
  switch (sort) {
    case "title":
      return sql`title COLLATE NOCASE ASC`;
    case "dateAdded":
      return sql`created_at DESC`;
    case "releaseDate":
      return sql`release_date DESC`;
    case "rating":
      return sql`vote_average DESC`;
    default:
      return sql`title COLLATE NOCASE ASC`;
  }
}

/** Parse a JSON genres string into a string array. */
function parseGenres(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === "string") : [];
  } catch {
    return [];
  }
}

/** Build a local cache poster URL for a movie row. */
function moviePosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return row.poster_override_path;
  if (row.poster_path) return `/media/images/movie/${row.external_id}/poster.jpg`;
  return null;
}

/** Build a local cache poster URL for a TV show row. */
function tvPosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return row.poster_override_path;
  if (row.poster_path) return `/media/images/tv/${row.external_id}/poster.jpg`;
  return null;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Build a CDN poster URL (TMDB for movies, local fallback for TV). */
function cdnPosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return null; // override is local-only
  if (row.type === "movie" && row.poster_path) return `${TMDB_IMAGE_BASE}${row.poster_path}`;
  return null;
}

/** Raw row shape from the UNION query. */
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

/** Build the base UNION ALL query combining movies and TV shows. */
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

/** Build a WHERE clause from filter conditions. */
function buildWhereClause(input: LibraryListInput): SQL | null {
  const conditions: SQL[] = [];

  if (input.type !== "all") {
    conditions.push(sql`type = ${input.type}`);
  }

  if (input.search) {
    conditions.push(sql`title LIKE ${"%" + input.search + "%"}`);
  }

  if (input.genre) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ${input.genre})`
    );
  }

  if (conditions.length === 0) return null;

  return conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);
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

  const items: LibraryItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type as "movie" | "tv",
    title: row.title,
    year: row.release_date ? new Date(row.release_date).getFullYear() : null,
    posterUrl: row.type === "movie" ? moviePosterUrl(row) : tvPosterUrl(row),
    cdnPosterUrl: cdnPosterUrl(row),
    genres: parseGenres(row.genres),
    voteAverage: row.vote_average,
    createdAt: row.created_at,
    releaseDate: row.release_date,
  }));

  return { items, total };
}

/**
 * Get all unique genres across movies and TV shows.
 */
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

/**
 * Get random unwatched movies from the library.
 *
 * Returns movies that have no completed watch_history entries.
 * Uses SQLite's RANDOM() for ordering.
 */
export function getQuickPicks(count: number): Movie[] {
  const db = getDrizzle();

  const rows = db
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

  return rows.map(toMovie);
}
