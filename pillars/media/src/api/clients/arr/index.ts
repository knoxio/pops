/**
 * Barrel for the Radarr/Sonarr (*arr) clients + env-only service helpers.
 *
 * The arr handlers import the env-configured client factories, the cached
 * status/queue/calendar helpers, and the connection tests from here. Config
 * is ENV-ONLY — see `config.ts`.
 */
import { clearQueueCache } from './queue.js';
import { clearCalendarCache } from './sonarr-ops.js';
import { clearAllStatusCaches } from './status-cache.js';

export {
  getArrConfig,
  getArrSettings,
  getRadarrClient,
  getRotationDefaults,
  getSonarrClient,
  type ArrSettings,
  type RotationDefaults,
} from './config.js';

export { RadarrClient } from './radarr-client.js';
export { SonarrClient } from './sonarr-client.js';
export { ArrApiError } from './types.js';

export { clearMovieStatusCache, getMovieStatus, getShowStatus } from './status-cache.js';

export { getDownloadQueue } from './queue.js';

export {
  addSeries,
  checkSeries,
  getSeriesEpisodes,
  getSonarrCalendar,
  getSonarrLanguageProfiles,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  triggerSeriesSearch,
  updateEpisodeMonitoring,
  updateSeasonMonitoring,
  updateSeriesMonitoring,
} from './sonarr-ops.js';

export {
  testRadarr,
  testRadarrSaved,
  testSonarr,
  testSonarrSaved,
  type TestOutcome,
} from './connection-test.js';

export type {
  ArrConfig,
  ArrStatus,
  ArrStatusResult,
  ArrSystemStatus,
  ArrTestResult,
  CalendarEpisode,
  DownloadQueueItem,
  RadarrCheckResult,
  RadarrCommandResponse,
  RadarrDiskSpace,
  RadarrMovie,
  RadarrQualityProfile,
  RadarrRootFolder,
  SonarrCheckResult,
  SonarrCommandResponse,
  SonarrEpisode,
  SonarrLanguageProfile,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeries,
  SonarrSeriesFull,
} from './types.js';

/** Clear all in-memory caches (status, queue, calendar). */
export function clearStatusCache(): void {
  clearAllStatusCaches();
  clearQueueCache();
  clearCalendarCache();
}
