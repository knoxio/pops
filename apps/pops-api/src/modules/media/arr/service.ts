/**
 * Arr service — re-exports settings, status caching, queue and Sonarr operation helpers.
 *
 * The implementation is split across:
 *  - `service-settings.ts`   — settings table + env var lookup, client factories
 *  - `service-status.ts`     — cached movie/show status lookups
 *  - `service-queue.ts`      — combined Radarr+Sonarr download queue
 *  - `service-sonarr-ops.ts` — calendar, series/season/episode operations
 */
import { clearQueueCache } from './service-queue.js';
import { clearCalendarCache } from './service-sonarr-ops.js';
import { clearAllStatusCaches } from './service-status.js';

export {
  getArrConfig,
  getArrSettings,
  getRadarrClient,
  getSonarrClient,
  saveArrSettings,
  type ArrSettings,
  type ArrSettingsUpdate,
} from './service-settings.js';

export { clearMovieStatusCache, getMovieStatus, getShowStatus } from './service-status.js';

export { getDownloadQueue } from './service-queue.js';

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
} from './service-sonarr-ops.js';

/** Clear all in-memory caches (status, queue, calendar). */
export function clearStatusCache(): void {
  clearAllStatusCaches();
  clearQueueCache();
  clearCalendarCache();
}
