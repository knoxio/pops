/**
 * Library service — orchestrates adding media to the local library
 * by fetching metadata from external APIs and inserting records.
 */
import { sql } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import { movies, watchHistory } from "@pops/db-types";
import type { TmdbClient } from "../tmdb/client.js";
import type { TmdbMovieDetail } from "../tmdb/types.js";
import { getMovieByTmdbId, getMovie, createMovie, updateMovie } from "../movies/service.js";
import { toMovie } from "../movies/types.js";
import type { Movie, UpdateMovieInput } from "../movies/types.js";
import type { MovieRow } from "@pops/db-types";
import type { LibraryItem, LibraryListInput } from "./types.js";

/**
 * Add a movie to the library by TMDB ID.
 *
 * Idempotent: returns the existing record if the movie is already in the library.
 * Fetches full detail from TMDB, maps fields, and inserts a new record.
 *
 * Image download is deferred until the image cache service is available (tb-058).
 */
export async function addMovie(
  tmdbId: number,
  tmdbClient: TmdbClient
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
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  });

  // TODO: download images in background when image cache service is available (tb-058)

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
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
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
 */
export async function refreshMovie(id: number, tmdbClient: TmdbClient): Promise<MovieRow> {
  // Get existing movie (throws NotFoundError if missing)
  const existing = getMovie(id);

  // Fetch fresh detail from TMDB
  const detail = await tmdbClient.getMovie(existing.tmdbId);

  // Map TMDB detail to update input (preserves poster_override_path)
  const updateInput = mapTmdbDetailToUpdate(detail);

  // Update the local record
  return updateMovie(id, updateInput);
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

// ── Unified Library List ──

const SORT_MAP: Record<string, string> = {
  dateAdded: "created_at DESC",
  title: "title COLLATE NOCASE ASC",
  releaseDate: "release_date DESC",
  rating: "vote_average DESC",
};

interface RawLibraryRow {
  id: number;
  type: string;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  poster_override_path: string | null;
  external_id: number;
  genres: string | null;
  vote_average: number | null;
  created_at: string;
}

function parseGenres(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * List library items (movies + TV shows) with unified filtering, sorting,
 * and pagination. Uses raw SQL UNION to combine both tables efficiently.
 */
export function listLibrary(input: LibraryListInput): {
  items: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const db = getDb();
  const movieParams: unknown[] = [];
  const tvParams: unknown[] = [];

  // Build conditional clauses for movies
  let movieWhere = "WHERE 1=1";
  if (input.search) {
    movieWhere += " AND title LIKE ?";
    movieParams.push(`%${input.search}%`);
  }
  if (input.genre) {
    movieWhere += " AND EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ?)";
    movieParams.push(input.genre);
  }

  // Build conditional clauses for TV shows
  let tvWhere = "WHERE 1=1";
  if (input.search) {
    tvWhere += " AND name LIKE ?";
    tvParams.push(`%${input.search}%`);
  }
  if (input.genre) {
    tvWhere += " AND EXISTS (SELECT 1 FROM json_each(genres) WHERE json_each.value = ?)";
    tvParams.push(input.genre);
  }

  const movieSql = `
    SELECT id, 'movie' as type, title, release_date, poster_path,
           poster_override_path, tmdb_id as external_id, genres, vote_average, created_at
    FROM movies ${movieWhere}`;

  const tvSql = `
    SELECT id, 'tv' as type, name as title, first_air_date as release_date,
           poster_path, poster_override_path, tvdb_id as external_id,
           genres, vote_average, created_at
    FROM tv_shows ${tvWhere}`;

  let unionSql: string;
  let allParams: unknown[];

  if (input.type === "movie") {
    unionSql = movieSql;
    allParams = movieParams;
  } else if (input.type === "tv") {
    unionSql = tvSql;
    allParams = tvParams;
  } else {
    unionSql = `${movieSql} UNION ALL ${tvSql}`;
    allParams = [...movieParams, ...tvParams];
  }

  const orderBy = SORT_MAP[input.sort] ?? "created_at DESC";
  const offset = (input.page - 1) * input.pageSize;

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM (${unionSql})`).get(...allParams) as {
    total: number;
  };

  const rows = db
    .prepare(`SELECT * FROM (${unionSql}) ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...allParams, input.pageSize, offset) as RawLibraryRow[];

  const total = totalRow.total;
  const totalPages = Math.ceil(total / input.pageSize);

  const items: LibraryItem[] = rows.map((row) => {
    let posterUrl: string | null = null;
    if (row.poster_override_path) {
      posterUrl = row.poster_override_path;
    } else if (row.poster_path) {
      const prefix = row.type === "movie" ? "movie" : "tv";
      posterUrl = `/media/images/${prefix}/${row.external_id}/poster.jpg`;
    }

    return {
      id: row.id,
      type: row.type as "movie" | "tv",
      title: row.title,
      year: row.release_date ? new Date(row.release_date).getFullYear() : null,
      posterUrl,
      genres: parseGenres(row.genres),
      voteAverage: row.vote_average,
      createdAt: row.created_at,
      releaseDate: row.release_date,
    };
  });

  return { items, total, page: input.page, pageSize: input.pageSize, totalPages };
}
