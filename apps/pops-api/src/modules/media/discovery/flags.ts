/**
 * Shared helpers for building Sets of TMDB IDs used by discovery services
 * to filter and annotate DiscoverResult objects.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies, watchHistory, mediaWatchlist } from "@pops/db-types";

/** Build a Set of TMDB IDs the user has watched (any entry in watch_history). */
export function getWatchedTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(watchHistory)
    .innerJoin(movies, eq(movies.id, watchHistory.mediaId))
    .where(eq(watchHistory.mediaType, "movie"))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** Build a Set of TMDB IDs currently on the user's watchlist. */
export function getWatchlistTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, "movie"))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/**
 * Build a Set of dismissed TMDB IDs from dismissed_discover.
 * Returns an empty set if the table doesn't exist yet.
 */
export function getDismissedTmdbIds(): Set<number> {
  try {
    const db = getDrizzle();
    const rows = db.all<{ tmdb_id: number }>(/* sql */ `SELECT tmdb_id FROM dismissed_discover`);
    return new Set(rows.map((r) => r.tmdb_id));
  } catch {
    return new Set();
  }
}
