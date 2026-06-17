/**
 * `rotation.*` sub-router — the rotation data plane: candidate queue,
 * exclusion list, sources (CRUD + sync + Plex-friends picker), and the
 * runtime-tunable settings.
 *
 * Ported from the monolith `media.rotation.*` tRPC routers (candidates,
 * exclusions, sources, config) + the scheduler procedures (slice 11b, spread
 * from `rest-rotation-scheduler.ts`: status / toggle / runNow / cancelLeaving /
 * leaving / lastCycle / diskSpace / log / log-stats).
 *
 * Config is repointed off `core/settings` onto the pillar-owned
 * `rotation_settings` kv table. Route order matters: literal sub-paths are
 * declared before `:tmdbId` / `:id` params so the Express adapter doesn't
 * capture them as the parametric segment.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { rotationSchedulerRoutes } from './rest-rotation-scheduler.js';
import {
  AddExclusionBody,
  AddToQueueBody,
  CandidateStatusResultSchema,
  CreateSourceBody,
  CreatedSourceSchema,
  DownloadCandidateResultSchema,
  ExclusionSchema,
  ListCandidatesQuery,
  ListCandidatesResultSchema,
  PlexFriendsResultSchema,
  SaveSettingsBody,
  SaveSettingsResultSchema,
  SettingsSchema,
  SourceSchema,
  SourceTypesSchema,
  SyncSourceResultSchema,
  UpdateSourceBody,
} from './rest-rotation-schemas.js';
import { ERR_RESPONSES, IdParam, MessageSchema } from './rest-schemas.js';

const c = initContract();

const TmdbParam = z.object({ tmdbId: IdParam });

export const mediaRotationContract = c.router({
  addToQueue: {
    method: 'POST',
    path: '/rotation/candidates',
    body: AddToQueueBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Add a movie to the rotation queue (manual source)',
  },
  listCandidates: {
    method: 'GET',
    path: '/rotation/candidates',
    query: ListCandidatesQuery,
    responses: { 200: z.object({ data: ListCandidatesResultSchema }), ...ERR_RESPONSES },
    summary: 'List rotation candidates with status filter, search, and pagination',
  },
  getCandidateStatus: {
    method: 'GET',
    path: '/rotation/candidates/status/:tmdbId',
    pathParams: TmdbParam,
    responses: { 200: z.object({ data: CandidateStatusResultSchema }), ...ERR_RESPONSES },
    summary: 'Get a movie’s queue + exclusion status',
  },
  downloadCandidate: {
    method: 'POST',
    path: '/rotation/candidates/:candidateId/download',
    pathParams: z.object({ candidateId: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: DownloadCandidateResultSchema }), ...ERR_RESPONSES },
    summary: 'Download a candidate (Radarr add + library entry + protect)',
  },
  removeFromQueue: {
    method: 'DELETE',
    path: '/rotation/candidates/:tmdbId',
    pathParams: TmdbParam,
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: z.object({ success: z.boolean() }) }), ...ERR_RESPONSES },
    summary: 'Remove a pending movie from the rotation queue',
  },

  addExclusion: {
    method: 'POST',
    path: '/rotation/exclusions',
    body: AddExclusionBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Exclude a movie from rotation',
  },
  getExclusion: {
    method: 'GET',
    path: '/rotation/exclusions/:tmdbId',
    pathParams: TmdbParam,
    responses: { 200: z.object({ data: ExclusionSchema.nullable() }), ...ERR_RESPONSES },
    summary: 'Get an exclusion entry by tmdbId',
  },
  removeExclusion: {
    method: 'DELETE',
    path: '/rotation/exclusions/:tmdbId',
    pathParams: TmdbParam,
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: z.object({ success: z.boolean() }) }), ...ERR_RESPONSES },
    summary: 'Remove a movie from the exclusion list',
  },

  sourceTypes: {
    method: 'GET',
    path: '/rotation/source-types',
    responses: { 200: z.object({ data: SourceTypesSchema }) },
    summary: 'List registered source adapter types',
  },
  listPlexFriends: {
    method: 'GET',
    path: '/rotation/plex-friends',
    responses: { 200: z.object({ data: PlexFriendsResultSchema }) },
    summary: 'List Plex friends (degrades to empty when Plex is unconfigured)',
  },
  listSources: {
    method: 'GET',
    path: '/rotation/sources',
    responses: { 200: z.object({ data: z.array(SourceSchema) }) },
    summary: 'List rotation sources with candidate counts',
  },
  createSource: {
    method: 'POST',
    path: '/rotation/sources',
    body: CreateSourceBody,
    responses: { 201: z.object({ data: CreatedSourceSchema }), ...ERR_RESPONSES },
    summary: 'Create a rotation source',
  },
  syncSource: {
    method: 'POST',
    path: '/rotation/sources/:id/sync',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: SyncSourceResultSchema }), ...ERR_RESPONSES },
    summary: 'Sync a source (fetch candidates from its adapter)',
  },
  updateSource: {
    method: 'PATCH',
    path: '/rotation/sources/:id',
    pathParams: z.object({ id: IdParam }),
    body: UpdateSourceBody,
    responses: { 200: z.object({ data: CreatedSourceSchema }), ...ERR_RESPONSES },
    summary: 'Update a rotation source',
  },
  deleteSource: {
    method: 'DELETE',
    path: '/rotation/sources/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: z.object({ success: z.boolean() }) }), ...ERR_RESPONSES },
    summary: 'Delete a rotation source and its candidates',
  },

  getSettings: {
    method: 'GET',
    path: '/rotation/settings',
    responses: { 200: z.object({ data: SettingsSchema }) },
    summary: 'Get rotation settings (with defaults for unset keys)',
  },
  saveSettings: {
    method: 'POST',
    path: '/rotation/settings',
    body: SaveSettingsBody,
    responses: { 200: z.object({ data: SaveSettingsResultSchema }), ...ERR_RESPONSES },
    summary: 'Save rotation settings',
  },

  ...rotationSchedulerRoutes,
});
