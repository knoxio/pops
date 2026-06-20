/**
 * Radarr route map for the `arr.*` sub-router (movies + config/queue).
 *
 * Literal sub-paths are declared before param paths so the dispatcher's
 * route table resolves them unambiguously. Numeric path params coerce from
 * the wire string via `IdParam`.
 */
import { z } from 'zod';

import {
  AddMovieBody,
  DownloadAndProtectBody,
  MonitoringBody,
  TestConnectionBody,
  TestResult,
} from './rest-arr-bodies.js';
import {
  ArrCommandResponseSchema,
  ArrConfigSchema,
  ArrSettingsSchema,
  ArrStatusResultSchema,
  DownloadAndProtectResultSchema,
  DownloadQueueItemSchema,
  ProfileSchema,
  RadarrCheckResultSchema,
  RadarrMovieSchema,
  RootFolderSchema,
} from './rest-arr-schemas.js';
import { ERR_RESPONSES, IdParam } from './rest-schemas.js';

export const radarrRoutes = {
  config: {
    method: 'GET',
    path: '/arr/config',
    responses: { 200: z.object({ data: ArrConfigSchema }) },
    summary: 'Env-derived configuration state for Radarr + Sonarr',
  },
  settings: {
    method: 'GET',
    path: '/arr/settings',
    responses: { 200: z.object({ data: ArrSettingsSchema }) },
    summary: 'Read-only env-derived arr settings (URLs + presence flags; no key values)',
  },
  queue: {
    method: 'GET',
    path: '/arr/queue',
    responses: { 200: z.object({ data: z.array(DownloadQueueItemSchema) }), ...ERR_RESPONSES },
    summary: 'Combined Radarr + Sonarr download queue',
  },
  getRadarrQualityProfiles: {
    method: 'GET',
    path: '/arr/radarr/quality-profiles',
    responses: { 200: z.object({ data: z.array(ProfileSchema) }), ...ERR_RESPONSES },
    summary: 'List Radarr quality profiles',
  },
  getRadarrRootFolders: {
    method: 'GET',
    path: '/arr/radarr/root-folders',
    responses: { 200: z.object({ data: z.array(RootFolderSchema) }), ...ERR_RESPONSES },
    summary: 'List Radarr root folders',
  },
  testRadarr: {
    method: 'POST',
    path: '/arr/radarr/test',
    body: TestConnectionBody,
    responses: { 200: TestResult, ...ERR_RESPONSES },
    summary: 'Test a Radarr connection with creds supplied in the request body',
  },
  testRadarrSaved: {
    method: 'POST',
    path: '/arr/radarr/test-saved',
    body: z.object({}).optional(),
    responses: { 200: TestResult },
    summary: 'Test the env-configured Radarr connection',
  },
  downloadAndProtect: {
    method: 'POST',
    path: '/arr/radarr/download-and-protect',
    body: DownloadAndProtectBody,
    responses: { 200: z.object({ data: DownloadAndProtectResultSchema }), ...ERR_RESPONSES },
    summary: 'Add a movie to Radarr, create a library entry, mark it rotation-protected',
  },
  addMovie: {
    method: 'POST',
    path: '/arr/radarr/movies',
    body: AddMovieBody,
    responses: { 201: z.object({ data: RadarrMovieSchema }), ...ERR_RESPONSES },
    summary: 'Add a movie to Radarr',
  },
  checkMovie: {
    method: 'GET',
    path: '/arr/radarr/movies/:tmdbId/check',
    pathParams: z.object({ tmdbId: IdParam }),
    responses: { 200: z.object({ data: RadarrCheckResultSchema }), ...ERR_RESPONSES },
    summary: 'Check whether a movie exists in Radarr by TMDB id',
  },
  getMovieStatus: {
    method: 'GET',
    path: '/arr/radarr/movies/:tmdbId/status',
    pathParams: z.object({ tmdbId: IdParam }),
    responses: { 200: z.object({ data: ArrStatusResultSchema }), ...ERR_RESPONSES },
    summary: 'Get the Radarr status of a movie by TMDB id',
  },
  updateRadarrMonitoring: {
    method: 'PATCH',
    path: '/arr/radarr/movies/:radarrId/monitoring',
    pathParams: z.object({ radarrId: IdParam }),
    body: MonitoringBody,
    responses: { 200: z.object({ data: RadarrMovieSchema }), ...ERR_RESPONSES },
    summary: 'Toggle monitoring for a movie in Radarr',
  },
  triggerRadarrSearch: {
    method: 'POST',
    path: '/arr/radarr/movies/:radarrId/search',
    pathParams: z.object({ radarrId: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: ArrCommandResponseSchema }), ...ERR_RESPONSES },
    summary: 'Trigger a Radarr search for a movie',
  },
} as const;
