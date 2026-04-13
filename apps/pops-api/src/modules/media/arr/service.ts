/**
 * Arr service — factory functions and in-memory status cache for Radarr/Sonarr.
 */
import { settings } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { SETTINGS_KEYS, type SettingsKey } from '../../core/settings/keys.js';
import { RadarrClient } from './radarr-client.js';
import { SonarrClient } from './sonarr-client.js';
import type {
  ArrConfig,
  ArrStatusResult,
  CalendarEpisode,
  DownloadQueueItem,
  SonarrAddSeriesInput,
  SonarrCalendarEpisode,
  SonarrCommandResponse,
  SonarrEpisode,
  SonarrLanguageProfile,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeriesFull,
} from './types.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: ArrStatusResult;
  expiresAt: number;
}

const movieStatusCache = new Map<number, CacheEntry>();
const showStatusCache = new Map<number, CacheEntry>();

// ---------------------------------------------------------------------------
// Settings helpers (settings table with env var fallback, like Plex)
// ---------------------------------------------------------------------------

function getSetting(key: SettingsKey): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  if (record?.value) return record.value;
  return null;
}

function getArrSetting(key: SettingsKey, envName: string): string | null {
  return getSetting(key) || getEnv(envName) || null;
}

function saveSetting(key: SettingsKey, value: string): void {
  const db = getDrizzle();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function deleteSetting(key: SettingsKey): void {
  const db = getDrizzle();
  db.delete(settings).where(eq(settings.key, key)).run();
}

/** Get current Arr settings (from settings table or env vars). */
export function getArrSettings(): {
  radarrUrl: string | null;
  radarrApiKey: string | null;
  sonarrUrl: string | null;
  sonarrApiKey: string | null;
} {
  return {
    radarrUrl: getArrSetting(SETTINGS_KEYS.RADARR_URL, 'RADARR_URL'),
    radarrApiKey: getArrSetting(SETTINGS_KEYS.RADARR_API_KEY, 'RADARR_API_KEY'),
    sonarrUrl: getArrSetting(SETTINGS_KEYS.SONARR_URL, 'SONARR_URL'),
    sonarrApiKey: getArrSetting(SETTINGS_KEYS.SONARR_API_KEY, 'SONARR_API_KEY'),
  };
}

/** Save Arr settings to the settings table. */
export function saveArrSettings(config: {
  radarrUrl?: string;
  radarrApiKey?: string;
  sonarrUrl?: string;
  sonarrApiKey?: string;
}): void {
  if (config.radarrUrl !== undefined) {
    if (config.radarrUrl) saveSetting(SETTINGS_KEYS.RADARR_URL, config.radarrUrl);
    else deleteSetting(SETTINGS_KEYS.RADARR_URL);
  }
  if (config.radarrApiKey !== undefined) {
    if (config.radarrApiKey) saveSetting(SETTINGS_KEYS.RADARR_API_KEY, config.radarrApiKey);
    else deleteSetting(SETTINGS_KEYS.RADARR_API_KEY);
  }
  if (config.sonarrUrl !== undefined) {
    if (config.sonarrUrl) saveSetting(SETTINGS_KEYS.SONARR_URL, config.sonarrUrl);
    else deleteSetting(SETTINGS_KEYS.SONARR_URL);
  }
  if (config.sonarrApiKey !== undefined) {
    if (config.sonarrApiKey) saveSetting(SETTINGS_KEYS.SONARR_API_KEY, config.sonarrApiKey);
    else deleteSetting(SETTINGS_KEYS.SONARR_API_KEY);
  }
}

/** Create a Radarr client if configured (settings table or env vars). */
export function getRadarrClient(): RadarrClient | null {
  const url = getArrSetting(SETTINGS_KEYS.RADARR_URL, 'RADARR_URL');
  const key = getArrSetting(SETTINGS_KEYS.RADARR_API_KEY, 'RADARR_API_KEY');
  if (!url || !key) return null;
  return new RadarrClient(url, key);
}

/** Create a Sonarr client if configured (settings table or env vars). */
export function getSonarrClient(): SonarrClient | null {
  const url = getArrSetting(SETTINGS_KEYS.SONARR_URL, 'SONARR_URL');
  const key = getArrSetting(SETTINGS_KEYS.SONARR_API_KEY, 'SONARR_API_KEY');
  if (!url || !key) return null;
  return new SonarrClient(url, key);
}

/** Get configuration state for both services. */
export function getArrConfig(): ArrConfig {
  const s = getArrSettings();
  return {
    radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
    sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
  };
}

/** Get movie status from Radarr with caching. Returns stale cache on connection failure. */
export async function getMovieStatus(tmdbId: number): Promise<ArrStatusResult> {
  const cached = movieStatusCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getRadarrClient();
  if (!client) {
    return { status: 'not_found', label: 'Radarr not configured' };
  }

  try {
    const result = await client.getMovieStatus(tmdbId);
    movieStatusCache.set(tmdbId, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  } catch (err) {
    console.warn(
      `Radarr connection failure for tmdbId=${tmdbId}:`,
      err instanceof Error ? err.message : err
    );
    if (cached) return cached.result;
    return { status: 'unavailable', label: 'Radarr unavailable' };
  }
}

/** Get TV show status from Sonarr with caching. Returns stale cache on connection failure. */
export async function getShowStatus(tvdbId: number): Promise<ArrStatusResult> {
  const cached = showStatusCache.get(tvdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getSonarrClient();
  if (!client) {
    return { status: 'not_found', label: 'Sonarr not configured' };
  }

  try {
    const result = await client.getShowStatus(tvdbId);
    showStatusCache.set(tvdbId, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  } catch (err) {
    console.warn(
      `Sonarr connection failure for tvdbId=${tvdbId}:`,
      err instanceof Error ? err.message : err
    );
    if (cached) return cached.result;
    return { status: 'unavailable', label: 'Sonarr unavailable' };
  }
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
        mediaType: 'movie',
        progress,
        source: 'radarr',
      });
    }
  }

  if (sonarrQueue) {
    for (const record of sonarrQueue.records) {
      const progress =
        record.size > 0 ? Math.round(((record.size - record.sizeleft) / record.size) * 100) : 0;
      const episodeLabel = record.episode
        ? `S${String(record.episode.seasonNumber).padStart(2, '0')}E${String(record.episode.episodeNumber).padStart(2, '0')}`
        : undefined;
      items.push({
        id: `sonarr-${record.id}`,
        title: record.title,
        mediaType: 'episode',
        episodeLabel,
        progress,
        source: 'sonarr',
      });
    }
  }

  queueCache = { items, expiresAt: Date.now() + QUEUE_CACHE_TTL_MS };
  return items;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

interface CalendarCacheEntry {
  episodes: CalendarEpisode[];
  expiresAt: number;
}

const calendarCache = new Map<string, CalendarCacheEntry>();

function mapCalendarEpisode(ep: SonarrCalendarEpisode): CalendarEpisode {
  const poster = ep.series.images.find((img) => img.coverType === 'poster');
  return {
    id: ep.id,
    seriesId: ep.seriesId,
    seriesTitle: ep.series.title,
    tvdbId: ep.series.tvdbId,
    episodeTitle: ep.title,
    seasonNumber: ep.seasonNumber,
    episodeNumber: ep.episodeNumber,
    airDateUtc: ep.airDateUtc,
    hasFile: ep.hasFile,
    posterUrl: poster?.remoteUrl ?? poster?.url ?? null,
  };
}

/** Get upcoming episodes from Sonarr calendar with 5-min cache. */
export async function getSonarrCalendar(start: string, end: string): Promise<CalendarEpisode[]> {
  const cacheKey = `${start}:${end}`;
  const cached = calendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.episodes;
  }

  const client = getSonarrClient();
  if (!client) return [];

  try {
    const raw = await client.getCalendar(start, end);
    const episodes = raw.map(mapCalendarEpisode);
    calendarCache.set(cacheKey, { episodes, expiresAt: Date.now() + CACHE_TTL_MS });
    return episodes;
  } catch (err) {
    console.warn('Sonarr calendar fetch failed:', err instanceof Error ? err.message : err);
    if (cached) return cached.episodes;
    return [];
  }
}

/** Check if a series exists in Sonarr by TVDB ID. */
export async function checkSeries(tvdbId: number): Promise<{
  exists: boolean;
  sonarrId?: number;
  monitored?: boolean;
  seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
}> {
  const client = getSonarrClient();
  if (!client) return { exists: false };
  return client.checkSeries(tvdbId);
}

/** Update season monitoring for a series in Sonarr. */
export async function updateSeasonMonitoring(
  sonarrId: number,
  seasonNumber: number,
  monitored: boolean
): Promise<SonarrSeriesFull> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  const result = await client.updateSeasonMonitoring(sonarrId, seasonNumber, monitored);
  showStatusCache.clear();
  client.clearCache();
  return result;
}

/** Batch update episode monitoring in Sonarr. */
export async function updateEpisodeMonitoring(
  episodeIds: number[],
  monitored: boolean
): Promise<void> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  await client.updateEpisodeMonitoring(episodeIds, monitored);
  showStatusCache.clear();
  client.clearCache();
}

/** Get episodes for a series from Sonarr, optionally filtered by season. */
export async function getSeriesEpisodes(
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrEpisode[]> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client.getEpisodes(sonarrId, seasonNumber);
}

// ---------------------------------------------------------------------------
// Sonarr profile / folder / add / search endpoints
// ---------------------------------------------------------------------------

/** Get Sonarr quality profiles. */
export async function getSonarrQualityProfiles(): Promise<SonarrQualityProfile[]> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client.getQualityProfiles();
}

/** Get Sonarr root folders. */
export async function getSonarrRootFolders(): Promise<SonarrRootFolder[]> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client.getRootFolders();
}

/** Get Sonarr language profiles. */
export async function getSonarrLanguageProfiles(): Promise<SonarrLanguageProfile[]> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client.getLanguageProfiles();
}

/** Add a series to Sonarr. */
export async function addSeries(input: SonarrAddSeriesInput): Promise<SonarrSeriesFull> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  const result = await client.addSeries(input);
  showStatusCache.clear();
  client.clearCache();
  return result;
}

/** Update whole-series monitoring flag. */
export async function updateSeriesMonitoring(
  sonarrId: number,
  monitored: boolean
): Promise<SonarrSeriesFull> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  const result = await client.updateMonitoring(sonarrId, monitored);
  showStatusCache.clear();
  client.clearCache();
  return result;
}

/** Trigger a search for a series or season. */
export async function triggerSeriesSearch(
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrCommandResponse> {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client.triggerSearch(sonarrId, seasonNumber);
}

/** Clear cached status for a specific movie by tmdbId. */
export function clearMovieStatusCache(tmdbId: number): void {
  movieStatusCache.delete(tmdbId);
}

/** Clear all cached statuses. */
export function clearStatusCache(): void {
  movieStatusCache.clear();
  showStatusCache.clear();
  queueCache = null;
  calendarCache.clear();
}
