/**
 * Handlers for the Sonarr routes of the `arr.*` sub-router
 * (series/season/episode + calendar). Thin wrappers over the env-configured
 * Sonarr client in `../clients/arr`; unconfigured services raise
 * `ConflictError` (409) via `requireSonarr`. The connection-test routes
 * swallow failures and report them in the `200` body (`connected:false`).
 *
 * These handlers do not touch the media db (only Radarr's
 * `downloadAndProtect` writes a library entry), so the factory takes no deps.
 */
import {
  addSeries,
  checkSeries,
  getSeriesEpisodes,
  getShowStatus,
  getSonarrCalendar,
  getSonarrLanguageProfiles,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  testSonarr,
  testSonarrSaved,
  triggerSeriesSearch,
  updateEpisodeMonitoring,
  updateSeasonMonitoring,
  updateSeriesMonitoring,
} from '../clients/arr/index.js';
import { requireSonarr, type ArrReq } from './arr-handlers-shared.js';
import { runHttp } from './error-mapping.js';

export function makeSonarrHandlers() {
  return {
    getSonarrQualityProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrQualityProfiles() },
      })),

    getSonarrRootFolders: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await getSonarrRootFolders() } })),

    getSonarrLanguageProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrLanguageProfiles() },
      })),

    getCalendar: ({ query }: ArrReq['getCalendar']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrCalendar(query.start, query.end) },
      })),

    testSonarr: ({ body }: ArrReq['testSonarr']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await testSonarr(body.url, body.apiKey),
      })),

    testSonarrSaved: () =>
      runHttp(async () => ({ status: 200 as const, body: await testSonarrSaved() })),

    updateEpisodeMonitoring: ({ body }: ArrReq['updateEpisodeMonitoring']) =>
      runHttp(async () => {
        requireSonarr();
        await updateEpisodeMonitoring(body.episodeIds, body.monitored);
        return {
          status: 200 as const,
          body: {
            message: `Updated ${body.episodeIds.length} episode(s) monitoring to ${body.monitored}`,
          },
        };
      }),

    addSeries: ({ body }: ArrReq['addSeries']) =>
      runHttp(async () => {
        requireSonarr();
        return { status: 201 as const, body: { data: await addSeries(body) } };
      }),

    checkSeries: ({ params }: ArrReq['checkSeries']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await checkSeries(params.tvdbId) },
      })),

    getShowStatus: ({ params }: ArrReq['getShowStatus']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getShowStatus(params.tvdbId) },
      })),

    getSeriesEpisodes: ({ params, query }: ArrReq['getSeriesEpisodes']) =>
      runHttp(async () => {
        requireSonarr();
        return {
          status: 200 as const,
          body: { data: await getSeriesEpisodes(params.sonarrId, query.seasonNumber) },
        };
      }),

    updateSeriesMonitoring: ({ params, body }: ArrReq['updateSeriesMonitoring']) =>
      runHttp(async () => {
        requireSonarr();
        return {
          status: 200 as const,
          body: { data: await updateSeriesMonitoring(params.sonarrId, body.monitored) },
        };
      }),

    updateSeasonMonitoring: ({ params, body }: ArrReq['updateSeasonMonitoring']) =>
      runHttp(async () => {
        requireSonarr();
        await updateSeasonMonitoring(params.sonarrId, params.seasonNumber, body.monitored);
        return {
          status: 200 as const,
          body: { message: `Season ${params.seasonNumber} monitoring set to ${body.monitored}` },
        };
      }),

    triggerSeriesSearch: ({ params, body }: ArrReq['triggerSeriesSearch']) =>
      runHttp(async () => {
        requireSonarr();
        return {
          status: 200 as const,
          body: { data: await triggerSeriesSearch(params.sonarrId, body?.seasonNumber) },
        };
      }),
  };
}
