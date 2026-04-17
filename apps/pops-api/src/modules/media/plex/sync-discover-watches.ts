import { and, eq } from 'drizzle-orm';

/**
 * Plex Discover cloud activity sync — fetches the user's complete watch history
 * from the Plex community GraphQL API and syncs it into POPS.
 *
 * Unlike the local server sync, this catches watches from streaming services
 * (Netflix, Disney+, etc.) and other Plex servers — any watch tracked by the
 * Plex account regardless of where it was played.
 *
 * Flow:
 *   1. Fetch user UUID from plex.tv
 *   2. Build a lookup map of Discover ratingKey → POPS movie
 *   3. Paginate through the community activity feed (watch history)
 *   4. For each entry:
 *      a. If it matches a POPS library item → log the watch
 *      b. If not in library → resolve metadata, add to library, then log
 *
 * Movies are added via TMDB ID. TV shows are added via TVDB ID and episodes
 * are matched by season + episode number within the show.
 */
import { episodes, movies, seasons, tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { addMovie } from '../library/service.js';
import { addTvShow } from '../library/tv-show-service.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { getTmdbClient } from '../tmdb/index.js';
import { getImageCache } from '../tmdb/index.js';
import { logWatch } from '../watch-history/service.js';
import { getPlexClientId, getPlexToken } from './service.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';
import { PlexApiError } from './types.js';

import type { PlexClient } from './client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverWatchSyncResult {
  movies: DiscoverItemResult;
  tvShows: DiscoverItemResult;
}

export interface DiscoverItemResult {
  /** Total activity entries of this type processed. */
  total: number;
  /** Entries that matched an existing POPS library item. */
  watched: number;
  /** New watch entries logged. */
  logged: number;
  /** Already had a watch entry. */
  alreadyLogged: number;
  /** New items added to library. */
  added: number;
  /** Could not resolve to TMDB/TVDB. */
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
/** Delay between Discover API requests to avoid rate limits. */
const RATE_LIMIT_DELAY_MS = 200;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function makeEmptyResult(): DiscoverItemResult {
  return {
    total: 0,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    added: 0,
    notFound: 0,
    errors: 0,
    errorSamples: [],
  };
}

function pushError(result: DiscoverItemResult, title: string, err: unknown): void {
  result.errors++;
  if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errorSamples.push(`${title}: ${msg}`);
  }
}

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
 * Fetches the user's full activity history and for each entry:
 * - If the item is already in the POPS library → log the watch
 * - If not in the library → resolve metadata, add to library, then log
 *
 * This is the "full activity history sync" — independent of what's currently
 * in the library. It adds missing items and logs missing watches.
 */
export async function syncDiscoverWatches(
  plexClient: PlexClient,
  onProgress?: (processed: number, total: number) => void,
  onPartialResult?: (result: DiscoverWatchSyncResult) => void
): Promise<DiscoverWatchSyncResult> {
  const db = getDrizzle();
  const token = getPlexToken();
  if (!token) throw new Error('Plex token not available');

  const tmdbClient = getTmdbClient();
  const imageCache = getImageCache();
  const tvdbClient = getTvdbClient();

  // Fetch the account UUID needed for the GraphQL query
  const uuid = await fetchAccountUuid(token);

  // Build lookup: Discover ratingKey → POPS movie
  // Movies with a cached ratingKey can be matched instantly.
  const allMovies = db
    .select({
      id: movies.id,
      title: movies.title,
      tmdbId: movies.tmdbId,
      discoverRatingKey: movies.discoverRatingKey,
    })
    .from(movies)
    .all();

  const movieByRatingKey = new Map<string, { id: number; title: string; tmdbId: number }>();
  const movieByTmdbId = new Map<number, { id: number; title: string }>();
  for (const m of allMovies) {
    if (m.discoverRatingKey) {
      movieByRatingKey.set(m.discoverRatingKey, { id: m.id, title: m.title, tmdbId: m.tmdbId });
    }
    movieByTmdbId.set(m.tmdbId, { id: m.id, title: m.title });
  }

  // Cache for show lookups: show title → resolved show info or null
  const showCache = new Map<string, { showId: number; tvdbId: number } | null>();

  const movieResult = makeEmptyResult();
  const tvResult = makeEmptyResult();

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
      const type = entry.metadataItem.type;

      if (type === 'MOVIE') {
        movieResult.total++;
        await processMovieEntry(
          entry,
          plexClient,
          tmdbClient,
          imageCache,
          movieByRatingKey,
          movieByTmdbId,
          movieResult,
          db
        );
      } else if (type === 'EPISODE') {
        tvResult.total++;
        await processEpisodeEntry(
          entry,
          plexClient,
          tvdbClient,
          imageCache,
          showCache,
          tvResult,
          db
        );
      }
      // SHOW-level entries are skipped — we can't log a meaningful watch
      // without knowing which episode was watched.

      processedEntries++;
      onProgress?.(processedEntries, totalEntries);
      onPartialResult?.({ movies: movieResult, tvShows: tvResult });
    }

    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  return { movies: movieResult, tvShows: tvResult };
}

// ---------------------------------------------------------------------------
// Entry processors
// ---------------------------------------------------------------------------

/**
 * Process a MOVIE watch entry.
 *
 * 1. Check if the movie is already in the library (by cached ratingKey)
 * 2. If not, resolve the Discover ratingKey → TMDB ID → add to library
 * 3. Log the watch
 */
async function processMovieEntry(
  entry: ActivityWatchEntry,
  plexClient: PlexClient,
  tmdbClient: ReturnType<typeof getTmdbClient>,
  imageCache: ReturnType<typeof getImageCache>,
  movieByRatingKey: Map<string, { id: number; title: string; tmdbId: number }>,
  movieByTmdbId: Map<number, { id: number; title: string }>,
  result: DiscoverItemResult,
  db: ReturnType<typeof getDrizzle>
): Promise<void> {
  const ratingKey = entry.metadataItem.id;
  const title = entry.metadataItem.title;

  try {
    // Fast path: movie already in library with cached ratingKey
    let movie = movieByRatingKey.get(ratingKey);

    if (!movie) {
      // Resolve the Discover metadata to get the TMDB ID
      await delay(RATE_LIMIT_DELAY_MS);
      const meta = await plexClient.getDiscoverMetadata(ratingKey);
      if (!meta) {
        result.notFound++;
        return;
      }

      const tmdbId = extractExternalIdAsNumber(meta, 'tmdb');
      if (!tmdbId) {
        result.notFound++;
        return;
      }

      // Check if we already have this movie by TMDB ID (just missing the ratingKey cache)
      const existing = movieByTmdbId.get(tmdbId);
      if (existing) {
        // Cache the ratingKey for future lookups
        db.update(movies)
          .set({ discoverRatingKey: ratingKey })
          .where(eq(movies.id, existing.id))
          .run();
        movie = { ...existing, tmdbId };
        movieByRatingKey.set(ratingKey, movie);
      } else {
        // Not in library at all — add it
        const { movie: newMovie } = await addMovie(tmdbId, tmdbClient, imageCache);
        // Cache the ratingKey
        db.update(movies)
          .set({ discoverRatingKey: ratingKey })
          .where(eq(movies.id, newMovie.id))
          .run();
        movie = { id: newMovie.id, title: newMovie.title, tmdbId };
        movieByRatingKey.set(ratingKey, movie);
        movieByTmdbId.set(tmdbId, { id: newMovie.id, title: newMovie.title });
        result.added++;
      }
    }

    // Log the watch
    result.watched++;
    const logResult = logWatch({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: entry.date,
      completed: 1,
      source: 'plex_sync',
    });
    if (logResult.created) result.logged++;
    else result.alreadyLogged++;
  } catch (err) {
    pushError(result, title, err);
  }
}

/**
 * Process an EPISODE watch entry.
 *
 * 1. Resolve the show (by grandparent title) — add to library if missing
 * 2. Find the episode by season + episode number
 * 3. Log the watch
 */
async function processEpisodeEntry(
  entry: ActivityWatchEntry,
  plexClient: PlexClient,
  tvdbClient: ReturnType<typeof getTvdbClient>,
  imageCache: ReturnType<typeof getImageCache>,
  showCache: Map<string, { showId: number; tvdbId: number } | null>,
  result: DiscoverItemResult,
  db: ReturnType<typeof getDrizzle>
): Promise<void> {
  const meta = entry.metadataItem;
  const showTitle = meta.grandparent?.title ?? meta.title;
  const seasonNumber = meta.parent?.index ?? 0;
  const episodeNumber = meta.index;

  try {
    // Resolve the show (cached per title to avoid repeated lookups)
    let showInfo = showCache.get(showTitle);
    if (showInfo === undefined) {
      showInfo = await resolveShow(plexClient, tvdbClient, imageCache, showTitle, result, db);
      showCache.set(showTitle, showInfo);
    }

    if (!showInfo) {
      // Already counted as notFound during resolveShow, but only on first miss
      if (showCache.get(showTitle) === null) {
        // Subsequent entries for the same unresolved show
        result.notFound++;
      }
      return;
    }

    // Find the episode by season + episode number
    const season = db
      .select({ id: seasons.id })
      .from(seasons)
      .where(and(eq(seasons.tvShowId, showInfo.showId), eq(seasons.seasonNumber, seasonNumber)))
      .get();

    if (!season) {
      result.notFound++;
      return;
    }

    const episode = db
      .select({ id: episodes.id })
      .from(episodes)
      .where(and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, episodeNumber)))
      .get();

    if (!episode) {
      result.notFound++;
      return;
    }

    // Log the watch
    result.watched++;
    const logResult = logWatch({
      mediaType: 'episode',
      mediaId: episode.id,
      watchedAt: entry.date,
      completed: 1,
      source: 'plex_sync',
    });
    if (logResult.created) result.logged++;
    else result.alreadyLogged++;
  } catch (err) {
    pushError(result, `${showTitle} S${seasonNumber}E${episodeNumber}`, err);
  }
}

/**
 * Resolve a TV show by title — searches Discover, extracts TVDB ID,
 * and adds to library if not already present.
 *
 * Returns the show info or null if unresolvable.
 */
async function resolveShow(
  plexClient: PlexClient,
  tvdbClient: ReturnType<typeof getTvdbClient>,
  imageCache: ReturnType<typeof getImageCache>,
  showTitle: string,
  result: DiscoverItemResult,
  db: ReturnType<typeof getDrizzle>
): Promise<{ showId: number; tvdbId: number } | null> {
  try {
    await delay(RATE_LIMIT_DELAY_MS);
    const searchResults = await plexClient.searchDiscover(showTitle, 'show');
    if (searchResults.length === 0) {
      result.notFound++;
      return null;
    }

    // Get metadata for the first result to extract TVDB ID
    // Try each candidate until we find one with a TVDB ID
    let tvdbId: number | null = null;
    let ratingKey: string | null = null;
    for (const candidate of searchResults) {
      const meta = await plexClient.getDiscoverMetadata(candidate.ratingKey);
      if (!meta) continue;
      tvdbId = extractExternalIdAsNumber(meta, 'tvdb');
      if (tvdbId) {
        ratingKey = candidate.ratingKey;
        break;
      }
    }

    if (!tvdbId) {
      result.notFound++;
      return null;
    }

    // Check if already in library by TVDB ID
    const existingShow = db
      .select({ id: tvShows.id, tvdbId: tvShows.tvdbId })
      .from(tvShows)
      .where(eq(tvShows.tvdbId, tvdbId))
      .get();

    if (existingShow) {
      // Cache ratingKey if we found one and it's not already cached
      if (ratingKey) {
        db.update(tvShows)
          .set({ discoverRatingKey: ratingKey })
          .where(eq(tvShows.id, existingShow.id))
          .run();
      }
      return { showId: existingShow.id, tvdbId };
    }

    // Add to library
    const { show: newShow } = await addTvShow(tvdbId, tvdbClient, imageCache);
    if (ratingKey) {
      db.update(tvShows)
        .set({ discoverRatingKey: ratingKey })
        .where(eq(tvShows.id, newShow.id))
        .run();
    }
    result.added++;
    return { showId: newShow.id, tvdbId };
  } catch (err) {
    pushError(result, showTitle, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Account UUID
// ---------------------------------------------------------------------------

async function fetchAccountUuid(token: string): Promise<string> {
  const res = await fetch('https://plex.tv/api/v2/user', {
    headers: { Accept: 'application/json', 'X-Plex-Token': token },
  });
  if (!res.ok) throw new PlexApiError(res.status, 'Failed to fetch Plex account info');
  const data = (await res.json()) as { uuid?: string };
  if (!data.uuid) throw new Error('Plex account UUID not found');
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

  const res = await fetch('https://community.plex.tv/api', {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      'x-plex-token': token,
      'x-plex-client-identifier': clientId,
      'x-plex-product': 'POPS',
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
    throw new Error('GraphQL response missing data');
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
  }>(token, WATCH_HISTORY_QUERY, variables, 'GetWatchHistoryHub');

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
    { first: 50, metadataID: ratingKey, types: ['WATCH_HISTORY'] },
    'GetActivityFeed'
  );
  return data.activityFeed?.nodes ?? [];
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
    const results = await plexClient.searchDiscover(title, 'movie');
    if (results.length === 0) return false;

    let ratingKey: string | null = null;
    for (const item of results) {
      const meta = await plexClient.getDiscoverMetadata(item.ratingKey);
      if (!meta) continue;
      const id = extractExternalIdAsNumber(meta, 'tmdb');
      if (id === tmdbId) {
        ratingKey = item.ratingKey;
        break;
      }
    }
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
        mediaType: 'movie',
        mediaId: movieId,
        watchedAt: state.lastViewedAt
          ? new Date(state.lastViewedAt * 1000).toISOString()
          : new Date().toISOString(),
        completed: 1,
        source: 'plex_sync',
      });
      return true;
    }

    // Log each individual watch event
    let logged = false;
    for (const node of nodes) {
      const result = logWatch({
        mediaType: 'movie',
        mediaId: movieId,
        watchedAt: node.date,
        completed: 1,
        source: 'plex_sync',
      });
      if (result.created) logged = true;
    }
    return logged;
  } catch {
    return false;
  }
}
