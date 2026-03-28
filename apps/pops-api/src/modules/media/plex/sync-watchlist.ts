/**
 * Plex watchlist sync — polls the Plex Discover cloud API and syncs
 * watchlist items into the POPS watchlist.
 *
 * Uses `discover.provider.plex.tv` (cloud API, not local server).
 * Same X-Plex-Token + X-Plex-Client-Identifier as library sync.
 *
 * Sync logic:
 *   - Items on Plex watchlist but not POPS → add with source="plex"
 *   - Items on both with source="manual" → escalate to source="both"
 *   - Items removed from Plex with source="plex" → remove from POPS
 *   - Items removed from Plex with source="both" → downgrade to "manual"
 */
import { eq, and, isNotNull } from "drizzle-orm";
import { mediaWatchlist } from "@pops/db-types";
import type { PlexMediaItem } from "./types.js";
import { PlexApiError } from "./types.js";
import { extractExternalIdAsNumber } from "./sync-helpers.js";
import { getPlexClientId } from "./service.js";
import { getDb, getDrizzle } from "../../../db.js";
import { getMovieByTmdbId, createMovie } from "../movies/service.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";
import { getTmdbClient } from "../tmdb/index.js";
import { getTvdbClient } from "../thetvdb/index.js";
import * as tvShowService from "../library/tv-show-service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistSyncProgress {
  total: number;
  processed: number;
  added: number;
  removed: number;
  skipped: number;
  errors: WatchlistSyncError[];
}

export interface WatchlistSyncError {
  title: string;
  reason: string;
}

export interface WatchlistSyncOptions {
  onProgress?: (progress: WatchlistSyncProgress) => void;
}

// ---------------------------------------------------------------------------
// Plex Discover API
// ---------------------------------------------------------------------------

const PLEX_DISCOVER_BASE = "https://discover.provider.plex.tv";

/**
 * Fetch all items from the Plex Universal Watchlist (cloud API).
 * Returns the same PlexMediaItem shape as local library items.
 */
export async function fetchPlexWatchlist(
  token: string,
  clientId: string
): Promise<PlexMediaItem[]> {
  const url = `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all?X-Plex-Token=${token}&X-Plex-Client-Identifier=${clientId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    throw new PlexApiError(
      0,
      `Network error fetching Plex watchlist: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new PlexApiError(
      response.status,
      `Plex Discover API error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    MediaContainer: {
      Metadata?: Array<{
        ratingKey: string;
        guid: string;
        type: string;
        title: string;
        year?: number;
        Guid?: Array<{ id: string }>;
      }>;
    };
  };

  const items = data.MediaContainer.Metadata ?? [];

  return items.map((item) => ({
    ratingKey: item.ratingKey,
    type: item.type,
    title: item.title,
    originalTitle: null,
    summary: null,
    tagline: null,
    year: item.year ?? null,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    addedAt: 0,
    updatedAt: 0,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: parseGuids(item.Guid),
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
  }));
}

/** Parse Guid array from Plex Discover response. */
function parseGuids(
  guids: Array<{ id: string }> | undefined
): Array<{ source: string; id: string }> {
  if (!guids) return [];
  return guids
    .map((g) => {
      const match = g.id.match(/^(\w+):\/\/(.+)$/);
      if (!match) return null;
      return { source: match[1], id: match[2] };
    })
    .filter((id): id is { source: string; id: string } => id !== null);
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync the Plex Universal Watchlist into the POPS watchlist.
 *
 * For each Plex watchlist item:
 *   1. Extract TMDB/TVDB ID from Guid array
 *   2. Ensure the item exists in the POPS library (add if missing)
 *   3. Add to POPS watchlist with source="plex" and plexRatingKey
 *   4. Handle source escalation (manual → both)
 *
 * After processing additions, handle removals:
 *   - Items in POPS watchlist with source="plex" not in Plex → remove
 *   - Items with source="both" not in Plex → downgrade to "manual"
 */
export async function syncWatchlistFromPlex(
  token: string,
  options: WatchlistSyncOptions = {}
): Promise<WatchlistSyncProgress> {
  const clientId = getPlexClientId();
  const plexItems = await fetchPlexWatchlist(token, clientId);

  const progress: WatchlistSyncProgress = {
    total: plexItems.length,
    processed: 0,
    added: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  };

  // Track which Plex ratingKeys we saw this sync
  const seenPlexRatingKeys = new Set<string>();

  // Phase 1: Process additions and updates
  for (const item of plexItems) {
    try {
      seenPlexRatingKeys.add(item.ratingKey);
      await syncSingleWatchlistItem(item, item.ratingKey, progress);
    } catch (err) {
      progress.errors.push({
        title: item.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    progress.processed++;
    options.onProgress?.(progress);
  }

  // Phase 2: Handle removals — items in POPS from Plex that are no longer in Plex watchlist
  handleRemovals(seenPlexRatingKeys, progress);

  return progress;
}

// ---------------------------------------------------------------------------
// Per-item sync
// ---------------------------------------------------------------------------

async function syncSingleWatchlistItem(
  item: PlexMediaItem,
  plexRatingKey: string,
  progress: WatchlistSyncProgress
): Promise<void> {
  const db = getDrizzle();

  // Determine media type and resolve local ID
  const resolved = await resolveMediaItem(item);
  if (!resolved) {
    progress.skipped++;
    return;
  }

  const { mediaType, mediaId } = resolved;

  // Check if already on watchlist
  const existing = db
    .select()
    .from(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .get();

  if (existing) {
    // Already on watchlist — handle source escalation
    if (existing.source === "manual") {
      db.update(mediaWatchlist)
        .set({ source: "both", plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    } else if (!existing.source || existing.source === "plex") {
      // Ensure plexRatingKey is set
      db.update(mediaWatchlist)
        .set({ source: "plex", plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    }
    progress.skipped++;
    return;
  }

  // Not on watchlist — add it
  db.insert(mediaWatchlist)
    .values({
      mediaType,
      mediaId,
      source: "plex",
      plexRatingKey,
    })
    .run();

  progress.added++;
}

// ---------------------------------------------------------------------------
// Media resolution
// ---------------------------------------------------------------------------

interface ResolvedMedia {
  mediaType: "movie" | "tv_show";
  mediaId: number;
}

/**
 * Resolve a Plex watchlist item to a local media record.
 * Ensures the item exists in the POPS library (adds if missing).
 */
async function resolveMediaItem(item: PlexMediaItem): Promise<ResolvedMedia | null> {
  if (item.type === "movie") {
    return resolveMovie(item);
  } else if (item.type === "show") {
    return resolveTvShow(item);
  }
  return null;
}

async function resolveMovie(item: PlexMediaItem): Promise<ResolvedMedia | null> {
  const tmdbId = extractExternalIdAsNumber(item, "tmdb");
  if (!tmdbId) return null;

  let movie = getMovieByTmdbId(tmdbId);

  if (!movie) {
    // Add to library first (same flow as library sync)
    try {
      const tmdbClient = getTmdbClient();
      const detail = await tmdbClient.getMovie(tmdbId);

      getDb().transaction(() => {
        createMovie({
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
      })();

      movie = getMovieByTmdbId(tmdbId);
    } catch {
      return null;
    }
  }

  if (!movie) return null;
  return { mediaType: "movie", mediaId: movie.id };
}

async function resolveTvShow(item: PlexMediaItem): Promise<ResolvedMedia | null> {
  const tvdbId = extractExternalIdAsNumber(item, "tvdb");
  if (!tvdbId) return null;

  let show = getTvShowByTvdbId(tvdbId);

  if (!show) {
    try {
      const tvdbClient = getTvdbClient();
      await tvShowService.addTvShow(tvdbId, tvdbClient);
      show = getTvShowByTvdbId(tvdbId);
    } catch {
      return null;
    }
  }

  if (!show) return null;
  return { mediaType: "tv_show", mediaId: show.id };
}

// ---------------------------------------------------------------------------
// Removal handling
// ---------------------------------------------------------------------------

/**
 * Remove or downgrade POPS watchlist entries that are no longer on the Plex watchlist.
 *
 * - source="plex" and not in Plex → delete
 * - source="both" and not in Plex → downgrade to "manual"
 */
function handleRemovals(seenPlexRatingKeys: Set<string>, progress: WatchlistSyncProgress): void {
  const db = getDrizzle();

  // Get all watchlist entries that have a plexRatingKey (came from Plex at some point)
  const plexEntries = db
    .select()
    .from(mediaWatchlist)
    .where(isNotNull(mediaWatchlist.plexRatingKey))
    .all();

  getDb().transaction(() => {
    for (const entry of plexEntries) {
      if (!entry.plexRatingKey) continue;
      if (seenPlexRatingKeys.has(entry.plexRatingKey)) continue;

      if (entry.source === "plex") {
        db.delete(mediaWatchlist).where(eq(mediaWatchlist.id, entry.id)).run();
        progress.removed++;
      } else if (entry.source === "both") {
        db.update(mediaWatchlist)
          .set({ source: "manual", plexRatingKey: null })
          .where(eq(mediaWatchlist.id, entry.id))
          .run();
      }
    }
  })();
}
