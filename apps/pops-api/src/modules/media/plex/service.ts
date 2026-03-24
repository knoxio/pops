/**
 * Plex sync service — orchestrates importing movies and TV shows
 * from a Plex Media Server into the local library, and syncs watch history.
 *
 * Flow:
 *   1. Connect to Plex → list libraries
 *   2. For each movie library: iterate items, extract TMDB ID, upsert via library service
 *   3. For each TV library: iterate items, extract TVDB ID, upsert via library service
 *   4. Sync watch history from Plex viewCount/lastViewedAt
 */
import { eq } from "drizzle-orm";
import { settings } from "@pops/db-types";
import { randomUUID } from "node:crypto";
import { PlexClient } from "./client.js";
import { extractExternalIdAsNumber, logMovieWatch, syncEpisodeWatches } from "./sync-helpers.js";
import { getEnv } from "../../../env.js";
import { getDrizzle } from "../../../db.js";
import * as libraryService from "../library/service.js";
import * as tvShowService from "../library/tv-show-service.js";
import { getTmdbClient } from "../tmdb/index.js";
import { getTvdbClient } from "../thetvdb/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: SyncError[];
}

export interface SyncError {
  title: string;
  reason: string;
}

export interface PlexSyncStatus {
  configured: boolean;
  hasUrl: boolean;
  hasToken: boolean;
  connected: boolean;
  lastSyncMovies: SyncResult | null;
  lastSyncTvShows: SyncResult | null;
}

// ---------------------------------------------------------------------------
// State (in-memory, per-process)
// ---------------------------------------------------------------------------

let lastMovieSync: SyncResult | null = null;
let lastTvSync: SyncResult | null = null;

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Get or generate a persistent Plex Client Identifier for this app instance.
 */
export function getPlexClientId(): string {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, "plex_client_identifier")).get();
  if (!record) {
    const newId = randomUUID();
    console.log(`[Plex] Generating new client identifier: ${newId}`);
    db.insert(settings)
      .values({ key: "plex_client_identifier", value: newId })
      .onConflictDoNothing()
      .run();
    // Fetch again just in case another request won the race
    const finalRecord = db
      .select()
      .from(settings)
      .where(eq(settings.key, "plex_client_identifier"))
      .get();
    return finalRecord?.value ?? newId;
  }
  return record.value;
}

/**
 * Get the configured Plex URL from settings or environment.
 */
export function getPlexUrl(): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, "plex_url")).get();
  if (record?.value) return record.value;
  return getEnv("PLEX_URL") || null;
}

/**
 * Create a PlexClient using the configured URL and the token from the database.
 * Returns null if the URL or the plex_token setting are not configured.
 */
export function getPlexClient(): PlexClient | null {
  const url = getPlexUrl();
  if (!url) {
    console.log("[Plex] PLEX_URL not set in settings or environment");
    return null;
  }

  const db = getDrizzle();
  const tokenRecord = db.select().from(settings).where(eq(settings.key, "plex_token")).get();
  const token = tokenRecord?.value;

  if (!token) {
    console.log("[Plex] No plex_token found in settings table");
    return null;
  }

  return new PlexClient(url, token);
}

// ---------------------------------------------------------------------------
// Section ID settings
// ---------------------------------------------------------------------------

export interface PlexSectionIds {
  movieSectionId: string | null;
  tvSectionId: string | null;
}

/** Read saved Plex library section IDs from the settings table. */
export function getPlexSectionIds(): PlexSectionIds {
  const db = getDrizzle();
  const movieRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, "plex_movie_section_id"))
    .get();
  const tvRecord = db.select().from(settings).where(eq(settings.key, "plex_tv_section_id")).get();
  return {
    movieSectionId: movieRecord?.value ?? null,
    tvSectionId: tvRecord?.value ?? null,
  };
}

/** Persist Plex library section IDs to the settings table. */
export function savePlexSectionIds(movieSectionId?: string, tvSectionId?: string): void {
  const db = getDrizzle();
  if (movieSectionId) {
    db.insert(settings)
      .values({ key: "plex_movie_section_id", value: movieSectionId })
      .onConflictDoUpdate({ target: settings.key, set: { value: movieSectionId } })
      .run();
  }
  if (tvSectionId) {
    db.insert(settings)
      .values({ key: "plex_tv_section_id", value: tvSectionId })
      .onConflictDoUpdate({ target: settings.key, set: { value: tvSectionId } })
      .run();
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Test connection to Plex server by fetching libraries. */
export async function testConnection(client: PlexClient): Promise<boolean> {
  try {
    await client.getLibraries();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync movies from a Plex library section.
 *
 * For each movie:
 *   1. Extract TMDB ID from Plex Guid array
 *   2. Add to library via `addMovie()` (idempotent)
 *   3. If Plex viewCount > 0, log watch history (if not already logged)
 */
export async function syncMovies(client: PlexClient, sectionId: string): Promise<SyncResult> {
  const tmdbClient = getTmdbClient();
  if (!tmdbClient) {
    return {
      synced: 0,
      skipped: 0,
      errors: [{ title: "Configuration", reason: "TMDB_API_KEY not configured" }],
    };
  }

  const items = await client.getAllItems(sectionId);
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  for (const item of items) {
    try {
      const tmdbId = extractExternalIdAsNumber(item, "tmdb");
      if (!tmdbId) {
        result.skipped++;
        continue;
      }

      // Add movie to library (idempotent)
      const { movie } = await libraryService.addMovie(tmdbId, tmdbClient);

      // Sync watch history if Plex shows it was watched
      if (item.viewCount > 0 && item.lastViewedAt) {
        logMovieWatch(movie.id, item.lastViewedAt);
      }

      result.synced++;
    } catch (err) {
      result.errors.push({
        title: item.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  lastMovieSync = result;
  return result;
}

/**
 * Sync TV shows from a Plex library section.
 *
 * For each show:
 *   1. Extract TVDB ID from Plex Guid array
 *   2. Add to library via `addTvShow()` (idempotent)
 *   3. Fetch episodes from Plex, log watch history for watched episodes
 */
export async function syncTvShows(client: PlexClient, sectionId: string): Promise<SyncResult> {
  const tvdbClient = getTvdbClient();
  if (!tvdbClient) {
    return {
      synced: 0,
      skipped: 0,
      errors: [{ title: "Configuration", reason: "THETVDB_API_KEY not configured" }],
    };
  }

  const items = await client.getAllItems(sectionId);
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  for (const item of items) {
    try {
      const tvdbId = extractExternalIdAsNumber(item, "tvdb");
      if (!tvdbId) {
        result.skipped++;
        continue;
      }

      // Add TV show to library (idempotent)
      await tvShowService.addTvShow(tvdbId, tvdbClient);

      // Sync episode watch history
      const plexEpisodes = await client.getEpisodes(item.ratingKey);
      syncEpisodeWatches(tvdbId, plexEpisodes);

      result.synced++;
    } catch (err) {
      result.errors.push({
        title: item.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  lastTvSync = result;
  return result;
}

/** Get current sync status. */
export function getSyncStatus(client: PlexClient | null): PlexSyncStatus {
  const db = getDrizzle();
  const token = db.select().from(settings).where(eq(settings.key, "plex_token")).get();
  const url = getPlexUrl();

  return {
    configured: client !== null,
    hasUrl: !!url,
    hasToken: !!token,
    connected: false, // Caller should test connection separately
    lastSyncMovies: lastMovieSync,
    lastSyncTvShows: lastTvSync,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset sync state — for testing only. */
export function _resetSyncState(): void {
  lastMovieSync = null;
  lastTvSync = null;
}
