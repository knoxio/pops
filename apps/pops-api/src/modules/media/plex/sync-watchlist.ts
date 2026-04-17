import { and, eq, isNotNull } from 'drizzle-orm';

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
import { mediaWatchlist } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../db.js';
import * as tvShowService from '../library/tv-show-service.js';
import { createMovie, getMovieByTmdbId } from '../movies/service.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { getTmdbClient } from '../tmdb/index.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';
import { getPlexClientId } from './service.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';
import { PlexApiError } from './types.js';

import type { PlexMediaItem } from './types.js';

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
  skipReasons: WatchlistSkipReason[];
}

export interface WatchlistSyncError {
  title: string;
  reason: string;
}

export interface WatchlistSkipReason {
  title: string;
  reason: string;
}

export interface WatchlistSyncOptions {
  onProgress?: (progress: WatchlistSyncProgress) => void;
}

// ---------------------------------------------------------------------------
// Plex Discover API
// ---------------------------------------------------------------------------

const PLEX_DISCOVER_BASE = 'https://discover.provider.plex.tv';

const WATCHLIST_PAGE_SIZE = 50;

interface PlexWatchlistResponse {
  MediaContainer: {
    totalSize?: number;
    Metadata?: Array<{
      ratingKey: string;
      guid: string;
      type: string;
      title: string;
      year?: number;
      Guid?: Array<{ id: string }>;
    }>;
  };
}

/**
 * Fetch a single page from the Plex Universal Watchlist (cloud API).
 */
async function fetchPlexWatchlistPage(
  token: string,
  clientId: string,
  start: number,
  size: number
): Promise<PlexWatchlistResponse> {
  const url =
    `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all` +
    `?X-Plex-Token=${token}` +
    `&X-Plex-Client-Identifier=${clientId}` +
    `&X-Plex-Container-Start=${start}` +
    `&X-Plex-Container-Size=${size}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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

  return (await response.json()) as PlexWatchlistResponse;
}

/**
 * Fetch all items from the Plex Universal Watchlist (cloud API).
 * Paginates using X-Plex-Container-Start / X-Plex-Container-Size to
 * retrieve every item (the API defaults to ~20 without these params).
 * Returns the same PlexMediaItem shape as local library items.
 */
export async function fetchPlexWatchlist(
  token: string,
  clientId: string
): Promise<PlexMediaItem[]> {
  const allItems: PlexMediaItem[] = [];
  let start = 0;

  while (true) {
    const data = await fetchPlexWatchlistPage(token, clientId, start, WATCHLIST_PAGE_SIZE);
    const pageItems = data.MediaContainer.Metadata ?? [];

    for (const item of pageItems) {
      allItems.push({
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
      });
    }

    // Stop if this page returned fewer items than requested (last page)
    if (pageItems.length < WATCHLIST_PAGE_SIZE) break;

    start += pageItems.length;

    // Safety: stop if we've reached totalSize (when available)
    const totalSize = data.MediaContainer.totalSize;
    if (totalSize !== undefined && allItems.length >= totalSize) break;
  }

  return allItems;
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
    skipReasons: [],
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
  const { resolved, skipReason } = await resolveMediaItem(item);
  if (!resolved) {
    progress.skipped++;
    progress.skipReasons.push({
      title: item.title,
      reason: skipReason ?? 'Could not resolve media item',
    });
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
    if (existing.source === 'manual') {
      db.update(mediaWatchlist)
        .set({ source: 'both', plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    } else if (!existing.source || existing.source === 'plex') {
      // Ensure plexRatingKey is set
      db.update(mediaWatchlist)
        .set({ source: 'plex', plexRatingKey })
        .where(eq(mediaWatchlist.id, existing.id))
        .run();
    }
    progress.skipped++;
    progress.skipReasons.push({
      title: item.title,
      reason: 'Already on watchlist',
    });
    return;
  }

  // Not on watchlist — add it
  db.insert(mediaWatchlist)
    .values({
      mediaType,
      mediaId,
      source: 'plex',
      plexRatingKey,
    })
    .run();

  progress.added++;
}

// ---------------------------------------------------------------------------
// Media resolution
// ---------------------------------------------------------------------------

interface ResolvedMedia {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
}

interface ResolveResult {
  resolved: ResolvedMedia | null;
  skipReason: string | null;
}

/**
 * Resolve a Plex watchlist item to a local media record.
 * Ensures the item exists in the POPS library (adds if missing).
 */
async function resolveMediaItem(item: PlexMediaItem): Promise<ResolveResult> {
  if (item.type === 'movie') {
    return resolveMovie(item);
  } else if (item.type === 'show') {
    return resolveTvShow(item);
  }
  return { resolved: null, skipReason: `Unsupported media type: ${item.type}` };
}

async function resolveMovie(item: PlexMediaItem): Promise<ResolveResult> {
  let tmdbId = extractExternalIdAsNumber(item, 'tmdb');

  // Fall back to TMDB title search when Plex metadata lacks the ID
  if (!tmdbId) {
    tmdbId = await searchTmdbByTitleYear(item.title, item.year);
    if (!tmdbId) {
      return {
        resolved: null,
        skipReason: 'No TMDB ID in Plex metadata and title search found no match',
      };
    }
  }

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
      return { resolved: null, skipReason: 'Failed to fetch movie from TMDB' };
    }
  }

  if (!movie) return { resolved: null, skipReason: 'Failed to create movie record' };
  return { resolved: { mediaType: 'movie', mediaId: movie.id }, skipReason: null };
}

async function resolveTvShow(item: PlexMediaItem): Promise<ResolveResult> {
  let tvdbId = extractExternalIdAsNumber(item, 'tvdb');

  // Fall back to TVDB title search when Plex metadata lacks the ID
  if (!tvdbId) {
    tvdbId = await searchTvdbByTitle(item.title, item.year);
    if (!tvdbId) {
      return {
        resolved: null,
        skipReason: 'No TVDB ID in Plex metadata and title search found no match',
      };
    }
  }

  let show = getTvShowByTvdbId(tvdbId);

  if (!show) {
    try {
      const tvdbClient = getTvdbClient();
      await tvShowService.addTvShow(tvdbId, tvdbClient);
      show = getTvShowByTvdbId(tvdbId);
    } catch {
      return { resolved: null, skipReason: 'Failed to fetch TV show from TVDB' };
    }
  }

  if (!show) return { resolved: null, skipReason: 'Failed to create TV show record' };
  return { resolved: { mediaType: 'tv_show', mediaId: show.id }, skipReason: null };
}

// ---------------------------------------------------------------------------
// Title-based search fallbacks
// ---------------------------------------------------------------------------

/**
 * Search TMDB for a movie by title and optional year.
 * Returns the first result's TMDB ID if the title is a close match.
 */
async function searchTmdbByTitleYear(title: string, year: number | null): Promise<number | null> {
  try {
    const tmdbClient = getTmdbClient();
    const result = await tmdbClient.searchMovies(title);
    if (result.results.length === 0) return null;

    // Find best match: prefer exact title + matching year
    for (const r of result.results) {
      const titleMatch = r.title.toLowerCase() === title.toLowerCase();
      const yearMatch =
        year && r.releaseDate ? new Date(r.releaseDate).getFullYear() === year : true;

      if (titleMatch && yearMatch) {
        return r.tmdbId;
      }
    }

    // No exact match — take first result if title is close enough
    const first = result.results[0];
    if (first && first.title.toLowerCase() === title.toLowerCase()) {
      return first.tmdbId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Search TVDB for a TV show by title and optional year.
 * Returns the first result's TVDB ID if the title is a close match.
 */
async function searchTvdbByTitle(title: string, year: number | null): Promise<number | null> {
  try {
    const tvdbClient = getTvdbClient();
    const results = await tvdbClient.searchSeries(title);
    if (results.length === 0) return null;

    // Find best match: prefer exact name + matching year
    for (const r of results) {
      const nameMatch = r.name.toLowerCase() === title.toLowerCase();
      const yearMatch = year && r.year ? Number(r.year) === year : true;

      if (nameMatch && yearMatch) {
        return r.tvdbId;
      }
    }

    // No exact match — take first result if name matches
    const first = results[0];
    if (first && first.name.toLowerCase() === title.toLowerCase()) {
      return first.tvdbId;
    }

    return null;
  } catch {
    return null;
  }
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

      if (entry.source === 'plex') {
        db.delete(mediaWatchlist).where(eq(mediaWatchlist.id, entry.id)).run();
        progress.removed++;
      } else if (entry.source === 'both') {
        db.update(mediaWatchlist)
          .set({ source: 'manual', plexRatingKey: null })
          .where(eq(mediaWatchlist.id, entry.id))
          .run();
      }
    }
  })();
}
