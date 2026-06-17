/**
 * Sonarr route map for the `arr.*` sub-router (series/season/episode +
 * calendar). Literal sub-paths are declared before param paths.
 */
import { z } from 'zod';

import {
  AddSeriesBody,
  CalendarQuery,
  EpisodeMonitoringBody,
  MessageBody,
  MonitoringBody,
  SeasonNumberQuery,
  TestConnectionBody,
  TestResult,
} from './rest-arr-bodies.js';
import {
  ArrCommandResponseSchema,
  ArrStatusResultSchema,
  CalendarEpisodeSchema,
  ProfileSchema,
  RootFolderSchema,
  SonarrCheckResultSchema,
  SonarrEpisodeSchema,
  SonarrSeriesFullSchema,
} from './rest-arr-schemas.js';
import { ERR_RESPONSES, IdParam } from './rest-schemas.js';

export const sonarrRoutes = {
  getSonarrQualityProfiles: {
    method: 'GET',
    path: '/arr/sonarr/quality-profiles',
    responses: { 200: z.object({ data: z.array(ProfileSchema) }), ...ERR_RESPONSES },
    summary: 'List Sonarr quality profiles',
  },
  getSonarrRootFolders: {
    method: 'GET',
    path: '/arr/sonarr/root-folders',
    responses: { 200: z.object({ data: z.array(RootFolderSchema) }), ...ERR_RESPONSES },
    summary: 'List Sonarr root folders',
  },
  getSonarrLanguageProfiles: {
    method: 'GET',
    path: '/arr/sonarr/language-profiles',
    responses: { 200: z.object({ data: z.array(ProfileSchema) }), ...ERR_RESPONSES },
    summary: 'List Sonarr language profiles',
  },
  getCalendar: {
    method: 'GET',
    path: '/arr/sonarr/calendar',
    query: CalendarQuery,
    responses: { 200: z.object({ data: z.array(CalendarEpisodeSchema) }), ...ERR_RESPONSES },
    summary: 'List upcoming episodes from the Sonarr calendar',
  },
  testSonarr: {
    method: 'POST',
    path: '/arr/sonarr/test',
    body: TestConnectionBody,
    responses: { 200: TestResult, ...ERR_RESPONSES },
    summary: 'Test a Sonarr connection with creds supplied in the request body',
  },
  testSonarrSaved: {
    method: 'POST',
    path: '/arr/sonarr/test-saved',
    body: z.object({}).optional(),
    responses: { 200: TestResult },
    summary: 'Test the env-configured Sonarr connection',
  },
  updateEpisodeMonitoring: {
    method: 'PATCH',
    path: '/arr/sonarr/episodes/monitoring',
    body: EpisodeMonitoringBody,
    responses: { 200: MessageBody, ...ERR_RESPONSES },
    summary: 'Batch-toggle episode monitoring in Sonarr',
  },
  addSeries: {
    method: 'POST',
    path: '/arr/sonarr/series',
    body: AddSeriesBody,
    responses: { 201: z.object({ data: SonarrSeriesFullSchema }), ...ERR_RESPONSES },
    summary: 'Add a series to Sonarr',
  },
  checkSeries: {
    method: 'GET',
    path: '/arr/sonarr/series/:tvdbId/check',
    pathParams: z.object({ tvdbId: IdParam }),
    responses: { 200: z.object({ data: SonarrCheckResultSchema }), ...ERR_RESPONSES },
    summary: 'Check whether a series exists in Sonarr by TVDB id',
  },
  getShowStatus: {
    method: 'GET',
    path: '/arr/sonarr/series/:tvdbId/status',
    pathParams: z.object({ tvdbId: IdParam }),
    responses: { 200: z.object({ data: ArrStatusResultSchema }), ...ERR_RESPONSES },
    summary: 'Get the Sonarr status of a series by TVDB id',
  },
  getSeriesEpisodes: {
    method: 'GET',
    path: '/arr/sonarr/series/:sonarrId/episodes',
    pathParams: z.object({ sonarrId: IdParam }),
    query: SeasonNumberQuery,
    responses: { 200: z.object({ data: z.array(SonarrEpisodeSchema) }), ...ERR_RESPONSES },
    summary: 'List episodes for a series, optionally filtered by season',
  },
  updateSeriesMonitoring: {
    method: 'PATCH',
    path: '/arr/sonarr/series/:sonarrId/monitoring',
    pathParams: z.object({ sonarrId: IdParam }),
    body: MonitoringBody,
    responses: { 200: z.object({ data: SonarrSeriesFullSchema }), ...ERR_RESPONSES },
    summary: 'Toggle whole-series monitoring in Sonarr',
  },
  updateSeasonMonitoring: {
    method: 'PATCH',
    path: '/arr/sonarr/series/:sonarrId/seasons/:seasonNumber/monitoring',
    pathParams: z.object({ sonarrId: IdParam, seasonNumber: z.coerce.number().int().min(0) }),
    body: MonitoringBody,
    responses: { 200: MessageBody, ...ERR_RESPONSES },
    summary: 'Toggle monitoring for a single season in Sonarr',
  },
  triggerSeriesSearch: {
    method: 'POST',
    path: '/arr/sonarr/series/:sonarrId/search',
    pathParams: z.object({ sonarrId: IdParam }),
    body: z.object({ seasonNumber: z.number().int().min(0).optional() }).optional(),
    responses: { 200: z.object({ data: ArrCommandResponseSchema }), ...ERR_RESPONSES },
    summary: 'Trigger a Sonarr search for a series or a specific season',
  },
} as const;
