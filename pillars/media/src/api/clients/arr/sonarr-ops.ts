/**
 * Sonarr calendar + series/season/episode operations.
 *
 * Calendar lookups carry a 5-minute module cache. Mutations clear the
 * status caches and the per-client GET cache so subsequent reads are fresh.
 */
import { getSonarrClient } from './config.js';
import { clearAllStatusCaches } from './status-cache.js';

import type { SonarrClient } from './sonarr-client.js';
import type {
  CalendarEpisode,
  SonarrAddSeriesInput,
  SonarrCalendarEpisode,
  SonarrCheckResult,
  SonarrCommandResponse,
  SonarrEpisode,
  SonarrLanguageProfile,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeriesFull,
} from './types.js';

const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

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

/** Require a configured Sonarr client; throws "Sonarr not configured" otherwise. */
function requireSonarr(): SonarrClient {
  const client = getSonarrClient();
  if (!client) throw new Error('Sonarr not configured');
  return client;
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
    calendarCache.set(cacheKey, { episodes, expiresAt: Date.now() + CALENDAR_CACHE_TTL_MS });
    return episodes;
  } catch (err) {
    console.warn('Sonarr calendar fetch failed:', err instanceof Error ? err.message : err);
    if (cached) return cached.episodes;
    return [];
  }
}

/** Check if a series exists in Sonarr by TVDB ID. */
export async function checkSeries(tvdbId: number): Promise<SonarrCheckResult> {
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
  const client = requireSonarr();
  const result = await client.updateSeasonMonitoring(sonarrId, seasonNumber, monitored);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Batch update episode monitoring in Sonarr. */
export async function updateEpisodeMonitoring(
  episodeIds: number[],
  monitored: boolean
): Promise<void> {
  const client = requireSonarr();
  await client.updateEpisodeMonitoring(episodeIds, monitored);
  clearAllStatusCaches();
  client.clearCache();
}

/** Get episodes for a series from Sonarr, optionally filtered by season. */
export async function getSeriesEpisodes(
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrEpisode[]> {
  const client = requireSonarr();
  return client.getEpisodes(sonarrId, seasonNumber);
}

/** Get Sonarr quality profiles. */
export async function getSonarrQualityProfiles(): Promise<SonarrQualityProfile[]> {
  return requireSonarr().getQualityProfiles();
}

/** Get Sonarr root folders. */
export async function getSonarrRootFolders(): Promise<SonarrRootFolder[]> {
  return requireSonarr().getRootFolders();
}

/** Get Sonarr language profiles. */
export async function getSonarrLanguageProfiles(): Promise<SonarrLanguageProfile[]> {
  return requireSonarr().getLanguageProfiles();
}

/** Add a series to Sonarr. */
export async function addSeries(input: SonarrAddSeriesInput): Promise<SonarrSeriesFull> {
  const client = requireSonarr();
  const result = await client.addSeries(input);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Update whole-series monitoring flag. */
export async function updateSeriesMonitoring(
  sonarrId: number,
  monitored: boolean
): Promise<SonarrSeriesFull> {
  const client = requireSonarr();
  const result = await client.updateMonitoring(sonarrId, monitored);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Trigger a search for a series or season. */
export async function triggerSeriesSearch(
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrCommandResponse> {
  return requireSonarr().triggerSearch(sonarrId, seasonNumber);
}

/** Reset the calendar cache. */
export function clearCalendarCache(): void {
  calendarCache.clear();
}
