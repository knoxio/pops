/**
 * Plex Discover cloud watch sync — fetches the user's complete watch history
 * from the Plex community GraphQL API and matches entries to POPS library items.
 *
 * Unlike the local server sync, this catches watches from streaming services
 * (Netflix, Disney+, etc.) and other Plex servers — any watch tracked by the
 * Plex account regardless of where it was played.
 *
 * Flow:
 *   1. Fetch user UUID from plex.tv
 *   2. Build a lookup map of Discover ratingKey → POPS movie/episode
 *   3. Paginate through the community activity feed (watch history)
 *   4. For each entry, match by ratingKey and log with the real watch date
 *
 * Note: TV show episode-level watches are not available from the cloud activity
 * feed (only show-level entries). Per-episode tracking is handled by local
 * server sync instead.
 */
import { eq } from "drizzle-orm";
import { movies, tvShows } from "@pops/db-types";
import { PlexApiError } from "./types.js";
import type { PlexClient } from "./client.js";
import { findDiscoverMatch } from "./sync-helpers.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";
import { getPlexToken, getPlexClientId } from "./service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverWatchSyncResult {
  movies: DiscoverItemResult;
  tvShows: DiscoverItemResult;
}

export interface DiscoverItemResult {
  /** Total items in POPS library. */
  total: number;
  /** Items found as watched on Plex Discover. */
  watched: number;
  /** New watch entries logged. */
  logged: number;
  /** Already had a watch entry. */
  alreadyLogged: number;
  /** Could not find on Plex Discover. */
  notFound: number;
  /** Errors during lookup. */
  errors: number;
  /** First few error messages for diagnostics (max 5). */
  errorSamples: string[];
}

// Keep old names as aliases for backwards compat
export type DiscoverMovieResult = DiscoverItemResult;
export type DiscoverTvShowResult = DiscoverItemResult;

/** A single watch event from the Plex community GraphQL API. */
interface ActivityWatchEntry {
  id: string;
  date: string;
  metadataItem: {
    id: string; // Discover ratingKey
    title: string;
    type: string;
    parent: { title: string; index: number } | null;
    grandparent: { title: string } | null;
    year: number | null;
    index: number;
  };
}

const MAX_ERROR_SAMPLES = 5;
const GRAPHQL_PAGE_SIZE = 50;
/** Delay between Discover search requests to avoid rate limits. */
const RATE_LIMIT_DELAY_MS = 200;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

const WATCH_HISTORY_QUERY = `
query GetWatchHistoryHub($uuid: ID = "", $first: PaginationInt!, $after: String) {
  user(id: $uuid) {
    watchHistory(first: $first, after: $after) {
      nodes {
        id
        date
        metadataItem {
          id
          title
          type
          index
          year
          parent { title, index }
          grandparent { title }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const ACTIVITY_FEED_QUERY = `
query GetActivityFeed($first: PaginationInt!, $metadataID: ID, $types: [ActivityType!]!) {
  activityFeed(first: $first, metadataID: $metadataID, types: $types) {
    nodes { date, id, metadataItem { id, title, type } }
  }
}`;

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync watch history from the Plex community GraphQL API.
 *
 * Instead of checking each library item individually (O(n) API calls per item),
 * this fetches the user's full watch history and matches entries to POPS library
 * items by Discover ratingKey. Each entry has an individual timestamp.
 */
export async function syncDiscoverWatches(
  plexClient: PlexClient,
  onProgress?: (processed: number, total: number) => void,
  onPartialResult?: (result: DiscoverWatchSyncResult) => void
): Promise<DiscoverWatchSyncResult> {
  const db = getDrizzle();
  const token = getPlexToken();
  if (!token) throw new Error("Plex token not available");

  // Fetch the account UUID needed for the GraphQL query
  const uuid = await fetchAccountUuid(token);

  // Build lookup: Discover ratingKey → POPS media info
  // We need to know which ratingKeys belong to POPS movies/shows.
  // Strategy: fetch all library items, then for each watch entry check if
  // its ratingKey matches a known item (built lazily via metadata lookups).
  const allMovies = db
    .select({
      id: movies.id,
      title: movies.title,
      tmdbId: movies.tmdbId,
      discoverRatingKey: movies.discoverRatingKey,
    })
    .from(movies)
    .all();

  const allShows = db
    .select({
      id: tvShows.id,
      name: tvShows.name,
      tvdbId: tvShows.tvdbId,
      discoverRatingKey: tvShows.discoverRatingKey,
    })
    .from(tvShows)
    .all();

  // Build ratingKey → POPS item maps from cached keys
  const movieByRatingKey = new Map<string, { id: number; title: string }>();
  for (const m of allMovies) {
    if (m.discoverRatingKey) {
      movieByRatingKey.set(m.discoverRatingKey, { id: m.id, title: m.title });
    }
  }

  const movieResult: DiscoverItemResult = {
    total: allMovies.length,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    notFound: 0,
    errors: 0,
    errorSamples: [],
  };

  const tvResult: DiscoverItemResult = {
    total: allShows.length,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    notFound: 0,
    errors: 0,
    errorSamples: [],
  };

  // Paginate through the full watch history
  let after: string | null = null;
  let totalEntries = 0;
  let processedEntries = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchWatchHistoryPage(token, uuid, after);
    const entries = page.nodes;
    totalEntries = Math.max(
      totalEntries,
      processedEntries + entries.length + (page.hasNextPage ? 1 : 0)
    );

    for (const entry of entries) {
      try {
        if (entry.metadataItem.type === "MOVIE") {
          const movie = movieByRatingKey.get(entry.metadataItem.id);
          if (movie) {
            movieResult.watched++;
            const logResult = logWatch({
              mediaType: "movie",
              mediaId: movie.id,
              watchedAt: entry.date,
              completed: 1,
              source: "plex_sync",
            });
            if (logResult.created) movieResult.logged++;
            else movieResult.alreadyLogged++;
          }
          // Not in library — skip (not an error, just not a POPS item)
        }
        // Episodes from watch history are show-level in Discover;
        // we don't have episode-level ratingKey mapping here.
        // TV episode watches are better handled by local server sync.
      } catch (err) {
        movieResult.errors++;
        if (movieResult.errorSamples.length < MAX_ERROR_SAMPLES) {
          const msg = err instanceof Error ? err.message : String(err);
          movieResult.errorSamples.push(`${entry.metadataItem.title}: ${msg}`);
        }
      }

      processedEntries++;
      onProgress?.(processedEntries, totalEntries);
      onPartialResult?.({ movies: movieResult, tvShows: tvResult });
    }

    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  // Now resolve any movies that didn't have a cached ratingKey.
  // Search Discover for each unmatched movie and cache the ratingKey for next time.
  const unmatchedMovies = allMovies.filter((m) => !m.discoverRatingKey);
  if (unmatchedMovies.length > 0) {
    await resolveAndCacheRatingKeys(plexClient, unmatchedMovies, db);
  }

  return { movies: movieResult, tvShows: tvResult };
}

// ---------------------------------------------------------------------------
// Account UUID
// ---------------------------------------------------------------------------

async function fetchAccountUuid(token: string): Promise<string> {
  const res = await fetch("https://plex.tv/api/v2/user", {
    headers: { Accept: "application/json", "X-Plex-Token": token },
  });
  if (!res.ok) throw new PlexApiError(res.status, "Failed to fetch Plex account info");
  const data = (await res.json()) as { uuid?: string };
  if (!data.uuid) throw new Error("Plex account UUID not found");
  return data.uuid;
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

interface WatchHistoryPage {
  nodes: ActivityWatchEntry[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Send a GraphQL request to the Plex community API. */
async function communityGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  operationName: string
): Promise<T> {
  const clientId = getPlexClientId();

  const res = await fetch("https://community.plex.tv/api", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      "x-plex-token": token,
      "x-plex-client-identifier": clientId,
      "x-plex-product": "POPS",
    },
    body: JSON.stringify({ query, variables, operationName }),
  });

  if (!res.ok) {
    throw new PlexApiError(res.status, `Community API error: ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0]?.message}`);
  }
  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }
  return json.data;
}

async function fetchWatchHistoryPage(
  token: string,
  uuid: string,
  after: string | null
): Promise<WatchHistoryPage> {
  const variables: Record<string, unknown> = {
    first: GRAPHQL_PAGE_SIZE,
    uuid,
  };
  if (after) variables.after = after;

  const data = await communityGraphQL<{
    user?: {
      watchHistory?: {
        nodes?: ActivityWatchEntry[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    };
  }>(token, WATCH_HISTORY_QUERY, variables, "GetWatchHistoryHub");

  const history = data.user?.watchHistory;
  return {
    nodes: history?.nodes ?? [],
    hasNextPage: history?.pageInfo?.hasNextPage ?? false,
    endCursor: history?.pageInfo?.endCursor ?? null,
  };
}

/** Fetch activity feed entries for a specific item. */
async function fetchActivityForItem(
  token: string,
  ratingKey: string
): Promise<Array<{ date: string }>> {
  const data = await communityGraphQL<{
    activityFeed?: { nodes?: Array<{ date: string }> };
  }>(
    token,
    ACTIVITY_FEED_QUERY,
    { first: 50, metadataID: ratingKey, types: ["WATCH_HISTORY"] },
    "GetActivityFeed"
  );
  return data.activityFeed?.nodes ?? [];
}

// ---------------------------------------------------------------------------
// Rating key resolution (first-run only)
// ---------------------------------------------------------------------------

/**
 * For movies without a cached Discover ratingKey, search Discover to find
 * and cache the mapping. This only needs to happen once per movie.
 * Rate-limited to avoid Plex API throttling on first run.
 */
async function resolveAndCacheRatingKeys(
  client: PlexClient,
  unmatchedMovies: Array<{ id: number; title: string; tmdbId: number }>,
  db: ReturnType<typeof getDrizzle>
): Promise<void> {
  for (const movie of unmatchedMovies) {
    try {
      const results = await client.searchDiscover(movie.title, "movie");
      if (results.length === 0) continue;

      const ratingKey = await findDiscoverMatch(client, results, "tmdb", movie.tmdbId);
      if (ratingKey) {
        db.update(movies)
          .set({ discoverRatingKey: ratingKey })
          .where(eq(movies.id, movie.id))
          .run();
      }
    } catch {
      // Best-effort — will retry on next sync
    }
    await delay(RATE_LIMIT_DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Single-item check (for use on library add)
// ---------------------------------------------------------------------------

/**
 * Check if a movie is watched on Plex Discover and log the watch if so.
 * Uses the activity feed GraphQL API to get individual watch dates.
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
    const token = getPlexToken();
    if (!token) return false;

    // Find the Discover ratingKey for this movie
    const results = await plexClient.searchDiscover(title, "movie");
    if (results.length === 0) return false;

    const ratingKey = await findDiscoverMatch(plexClient, results, "tmdb", tmdbId);
    if (!ratingKey) return false;

    // Cache the ratingKey
    const db = getDrizzle();
    db.update(movies).set({ discoverRatingKey: ratingKey }).where(eq(movies.id, movieId)).run();

    // Check userState for quick watched check (avoids paginating full history)
    const state = await plexClient.getUserState(ratingKey);
    if (!state || state.viewCount === 0) return false;

    // Fetch activity feed for this specific item to get individual dates
    const nodes = await fetchActivityForItem(token, ratingKey);

    if (nodes.length === 0) {
      // Fallback to userState lastViewedAt
      logWatch({
        mediaType: "movie",
        mediaId: movieId,
        watchedAt: state.lastViewedAt
          ? new Date(state.lastViewedAt * 1000).toISOString()
          : new Date().toISOString(),
        completed: 1,
        source: "plex_sync",
      });
      return true;
    }

    // Log each individual watch event
    let logged = false;
    for (const node of nodes) {
      const result = logWatch({
        mediaType: "movie",
        mediaId: movieId,
        watchedAt: node.date,
        completed: 1,
        source: "plex_sync",
      });
      if (result.created) logged = true;
    }
    return logged;
  } catch {
    return false;
  }
}
