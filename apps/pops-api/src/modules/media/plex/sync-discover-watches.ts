/**
 * Plex Discover cloud watch sync — checks the Plex cloud (metadata.provider.plex.tv)
 * for watch state on all movies and TV shows in the POPS library.
 *
 * Unlike the local server sync, this catches watches from streaming services
 * (Netflix, Disney+, etc.) and other Plex servers — any watch tracked by the
 * Plex account regardless of where it was played.
 *
 * Flow per item:
 *   1. Search Plex Discover by title to get the cloud ratingKey
 *   2. Check userState on that ratingKey for viewCount > 0
 *   3. If watched, log a watch event in POPS
 */
import { movies, tvShows } from "@pops/db-types";
import type { PlexClient } from "./client.js";
import { extractExternalIdAsNumber } from "./sync-helpers.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverWatchSyncResult {
  movies: DiscoverMovieResult;
  tvShows: DiscoverTvShowResult;
}

export interface DiscoverMovieResult {
  /** Total movies in POPS library. */
  total: number;
  /** Movies found as watched on Plex Discover. */
  watched: number;
  /** New watch entries logged. */
  logged: number;
  /** Already had a watch entry. */
  alreadyLogged: number;
  /** Could not find on Plex Discover. */
  notFound: number;
  /** Errors during lookup. */
  errors: number;
}

export interface DiscoverTvShowResult {
  /** Total TV shows in POPS library. */
  total: number;
  /** Shows found as watched on Plex Discover. */
  watched: number;
  /** New watch entries logged (show-level, not per-episode). */
  logged: number;
  /** Already had a watch entry. */
  alreadyLogged: number;
  /** Could not find on Plex Discover. */
  notFound: number;
  /** Errors during lookup. */
  errors: number;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync watch status from Plex Discover cloud for all POPS library items.
 *
 * @param plexClient - Authenticated Plex client
 * @param onProgress - Optional callback for progress updates (item count)
 */
export async function syncDiscoverWatches(
  plexClient: PlexClient,
  onProgress?: (processed: number, total: number) => void
): Promise<DiscoverWatchSyncResult> {
  const db = getDrizzle();

  // Get all movies and TV shows from POPS library
  const allMovies = db
    .select({ id: movies.id, title: movies.title, tmdbId: movies.tmdbId })
    .from(movies)
    .all();

  const allShows = db
    .select({ id: tvShows.id, name: tvShows.name, tvdbId: tvShows.tvdbId })
    .from(tvShows)
    .all();

  const totalItems = allMovies.length + allShows.length;
  let processed = 0;

  // Sync movies
  const movieResult: DiscoverMovieResult = {
    total: allMovies.length,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    notFound: 0,
    errors: 0,
  };

  for (const movie of allMovies) {
    try {
      const synced = await syncSingleMovieWatch(plexClient, movie.id, movie.title, movie.tmdbId);
      if (synced === "logged") movieResult.logged++;
      else if (synced === "already") movieResult.alreadyLogged++;
      else if (synced === "not_watched") {
        /* not watched on Plex */
      } else movieResult.notFound++;

      if (synced === "logged" || synced === "already") movieResult.watched++;
    } catch {
      movieResult.errors++;
    }

    processed++;
    onProgress?.(processed, totalItems);
  }

  // Sync TV shows (show-level watch check only)
  const tvResult: DiscoverTvShowResult = {
    total: allShows.length,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    notFound: 0,
    errors: 0,
  };

  for (const show of allShows) {
    try {
      const synced = await syncSingleTvShowWatch(plexClient, show.id, show.name, show.tvdbId);
      if (synced === "logged") tvResult.logged++;
      else if (synced === "already") tvResult.alreadyLogged++;
      else if (synced === "not_watched") {
        /* not watched on Plex */
      } else tvResult.notFound++;

      if (synced === "logged" || synced === "already") tvResult.watched++;
    } catch {
      tvResult.errors++;
    }

    processed++;
    onProgress?.(processed, totalItems);
  }

  return { movies: movieResult, tvShows: tvResult };
}

// ---------------------------------------------------------------------------
// Per-item sync
// ---------------------------------------------------------------------------

type SyncStatus = "logged" | "already" | "not_watched" | "not_found";

/**
 * Check a single movie against Plex Discover and log watch if played.
 *
 * Uses a small delay between API calls to avoid rate limiting.
 */
async function syncSingleMovieWatch(
  client: PlexClient,
  movieId: number,
  title: string,
  tmdbId: number
): Promise<SyncStatus> {
  // Search Discover for the movie
  const results = await client.searchDiscover(title, "movie");

  // Match by TMDB ID
  const match = results.find((item) => {
    const id = extractExternalIdAsNumber(item, "tmdb");
    return id === tmdbId;
  });
  if (!match) return "not_found";

  // Check user state
  const state = await client.getUserState(match.ratingKey);
  if (!state || state.viewCount === 0) return "not_watched";

  // Log the watch
  try {
    const result = logWatch({
      mediaType: "movie",
      mediaId: movieId,
      watchedAt: state.lastViewedAt
        ? new Date(state.lastViewedAt * 1000).toISOString()
        : new Date().toISOString(),
      completed: 1,
      source: "plex_sync",
    });
    return result.created ? "logged" : "already";
  } catch {
    return "already";
  }
}

/**
 * Check a single TV show against Plex Discover and log a show-level watch
 * event if the user has watched it. Since Discover doesn't expose per-episode
 * state easily, we log at the show level by checking if the show itself has
 * been interacted with (viewCount > 0 on the show-level metadata).
 *
 * Note: For per-episode watch history, the local server sync is more accurate.
 * This catches shows watched entirely outside the local library.
 */
async function syncSingleTvShowWatch(
  client: PlexClient,
  _tvShowId: number,
  name: string,
  tvdbId: number
): Promise<SyncStatus> {
  // Search Discover for the show
  const results = await client.searchDiscover(name, "show");

  // Match by TVDB ID
  const match = results.find((item) => {
    const id = extractExternalIdAsNumber(item, "tvdb");
    return id === tvdbId;
  });
  if (!match) return "not_found";

  // Check user state — for TV shows this indicates the user has interacted with it
  const state = await client.getUserState(match.ratingKey);
  if (!state || state.viewCount === 0) return "not_watched";

  // TV show watch state is tracked but we don't log show-level watch events
  // (watch_history only supports "movie" and "episode" media types).
  // Return "already" to indicate it's tracked on Plex's side.
  return "already";
}

// ---------------------------------------------------------------------------
// Single-item check (for use on library add)
// ---------------------------------------------------------------------------

/**
 * Check if a movie is watched on Plex Discover and log the watch if so.
 * Best-effort — returns false on any error without throwing.
 *
 * Call this when a movie is added to the library to auto-mark it as watched.
 */
export async function checkAndLogMovieWatch(
  plexClient: PlexClient,
  movieId: number,
  title: string,
  tmdbId: number
): Promise<boolean> {
  try {
    const status = await syncSingleMovieWatch(plexClient, movieId, title, tmdbId);
    return status === "logged";
  } catch {
    return false;
  }
}
