/**
 * Arr service — factory functions and in-memory status cache for Radarr/Sonarr.
 */
import { RadarrClient } from "./radarr-client.js";
import { SonarrClient } from "./sonarr-client.js";
import type { ArrConfig, ArrStatusResult, DownloadQueueItem } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: ArrStatusResult;
  expiresAt: number;
}

const movieStatusCache = new Map<number, CacheEntry>();
const showStatusCache = new Map<number, CacheEntry>();

/** Create a Radarr client if env vars are configured. */
export function getRadarrClient(): RadarrClient | null {
  const url = process.env["RADARR_URL"];
  const key = process.env["RADARR_API_KEY"];
  if (!url || !key) return null;
  return new RadarrClient(url, key);
}

/** Create a Sonarr client if env vars are configured. */
export function getSonarrClient(): SonarrClient | null {
  const url = process.env["SONARR_URL"];
  const key = process.env["SONARR_API_KEY"];
  if (!url || !key) return null;
  return new SonarrClient(url, key);
}

/** Get configuration state for both services. */
export function getArrConfig(): ArrConfig {
  return {
    radarrConfigured: !!(process.env["RADARR_URL"] && process.env["RADARR_API_KEY"]),
    sonarrConfigured: !!(process.env["SONARR_URL"] && process.env["SONARR_API_KEY"]),
  };
}

/** Get movie status from Radarr with caching. */
export async function getMovieStatus(tmdbId: number): Promise<ArrStatusResult> {
  const cached = movieStatusCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getRadarrClient();
  if (!client) {
    return { status: "not_found", label: "Radarr not configured" };
  }

  const result = await client.getMovieStatus(tmdbId);
  movieStatusCache.set(tmdbId, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

/** Get TV show status from Sonarr with caching. */
export async function getShowStatus(tvdbId: number): Promise<ArrStatusResult> {
  const cached = showStatusCache.get(tvdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getSonarrClient();
  if (!client) {
    return { status: "not_found", label: "Sonarr not configured" };
  }

  const result = await client.getShowStatus(tvdbId);
  showStatusCache.set(tvdbId, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

const QUEUE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

interface QueueCacheEntry {
  items: DownloadQueueItem[];
  expiresAt: number;
}

let queueCache: QueueCacheEntry | null = null;

/** Get combined download queue from Radarr + Sonarr with 30s cache. */
export async function getDownloadQueue(): Promise<DownloadQueueItem[]> {
  if (queueCache && queueCache.expiresAt > Date.now()) {
    return queueCache.items;
  }

  const radarrClient = getRadarrClient();
  const sonarrClient = getSonarrClient();

  const [radarrQueue, sonarrQueue] = await Promise.all([
    radarrClient ? radarrClient.getQueue().catch(() => null) : null,
    sonarrClient ? sonarrClient.getQueue().catch(() => null) : null,
  ]);

  const items: DownloadQueueItem[] = [];

  if (radarrQueue) {
    for (const record of radarrQueue.records) {
      const progress =
        record.size > 0 ? Math.round(((record.size - record.sizeleft) / record.size) * 100) : 0;
      items.push({
        id: `radarr-${record.id}`,
        title: record.title,
        mediaType: "movie",
        progress,
        source: "radarr",
      });
    }
  }

  if (sonarrQueue) {
    for (const record of sonarrQueue.records) {
      const progress =
        record.size > 0 ? Math.round(((record.size - record.sizeleft) / record.size) * 100) : 0;
      const episodeLabel = record.episode
        ? `S${String(record.episode.seasonNumber).padStart(2, "0")}E${String(record.episode.episodeNumber).padStart(2, "0")}`
        : undefined;
      items.push({
        id: `sonarr-${record.id}`,
        title: record.title,
        mediaType: "episode",
        episodeLabel,
        progress,
        source: "sonarr",
      });
    }
  }

  queueCache = { items, expiresAt: Date.now() + QUEUE_CACHE_TTL_MS };
  return items;
}

/** Clear all cached statuses. */
export function clearStatusCache(): void {
  movieStatusCache.clear();
  showStatusCache.clear();
  queueCache = null;
}
