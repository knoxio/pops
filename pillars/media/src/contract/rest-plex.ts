/**
 * `plex.*` sub-router — Plex Media Server connection + auth.
 *
 * Ported from the monolith `media.plex.*` tRPC routers (connection + auth).
 * Wire shapes mirror the legacy procedures: connection state, library
 * listing, URL get/set, username, the plex.tv PIN auth handshake, and the
 * config-only section-id / sync-status reads.
 *
 * Token persistence is repointed onto the pillar-owned `plex_settings`
 * table (the pillar cannot reach `core/settings`); the sync orchestration
 * (sync-*.ts / scheduler.ts) stays in the monolith for slices 9b/9c.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { plexSchedulerRoutes } from './rest-plex-scheduler.js';
import { plexSyncRoutes } from './rest-plex-sync.js';
import { ERR_RESPONSES, MessageSchema } from './rest-schemas.js';

const c = initContract();

const PlexLibrarySchema = z.object({
  key: z.string(),
  title: z.string(),
  type: z.string(),
  agent: z.string(),
  scanner: z.string(),
  language: z.string(),
  uuid: z.string(),
  updatedAt: z.number(),
  scannedAt: z.number(),
});

const AuthPinSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  clientId: z.string(),
});

const CheckPinResultSchema = z.object({
  connected: z.boolean(),
  username: z.string().nullable().optional(),
  expired: z.boolean().optional(),
});

const SyncStatusSchema = z.object({
  configured: z.boolean(),
  hasUrl: z.boolean(),
  hasToken: z.boolean(),
  connected: z.boolean(),
});

const SectionIdsSchema = z.object({
  movieSectionId: z.string().nullable(),
  tvSectionId: z.string().nullable(),
});

const SectionIdInput = z.string().min(1).optional();

export const mediaPlexContract = c.router({
  testConnection: {
    method: 'GET',
    path: '/plex/test-connection',
    responses: {
      200: z.object({ data: z.object({ connected: z.boolean(), error: z.string().optional() }) }),
      ...ERR_RESPONSES,
    },
    summary: 'Test the configured Plex connection',
  },
  getLibraries: {
    method: 'GET',
    path: '/plex/libraries',
    responses: { 200: z.object({ data: z.array(PlexLibrarySchema) }), ...ERR_RESPONSES },
    summary: 'List the Plex server libraries (sections)',
  },
  getPlexUrl: {
    method: 'GET',
    path: '/plex/url',
    responses: { 200: z.object({ data: z.string().nullable() }) },
    summary: 'Get the configured Plex server URL',
  },
  setUrl: {
    method: 'POST',
    path: '/plex/url',
    body: z.object({ url: z.string().min(1) }),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Validate + persist the Plex server URL',
  },
  getPlexUsername: {
    method: 'GET',
    path: '/plex/username',
    responses: { 200: z.object({ data: z.string().nullable() }) },
    summary: 'Get the connected Plex username',
  },
  getAuthPin: {
    method: 'POST',
    path: '/plex/auth/pin',
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: AuthPinSchema }), ...ERR_RESPONSES },
    summary: 'Create a plex.tv auth PIN',
  },
  checkAuthPin: {
    method: 'POST',
    path: '/plex/auth/pin/check',
    body: z.object({ id: z.number().int() }),
    responses: { 200: z.object({ data: CheckPinResultSchema }), ...ERR_RESPONSES },
    summary: 'Poll a plex.tv auth PIN; persists the token once authorised',
  },
  disconnect: {
    method: 'POST',
    path: '/plex/disconnect',
    body: z.object({}).optional(),
    responses: { 200: MessageSchema },
    summary: 'Clear the persisted Plex token + username',
  },
  getSyncStatus: {
    method: 'GET',
    path: '/plex/sync-status',
    responses: { 200: z.object({ data: SyncStatusSchema }) },
    summary: 'Connection-config snapshot (configured / hasUrl / hasToken)',
  },
  getSectionIds: {
    method: 'GET',
    path: '/plex/section-ids',
    responses: { 200: z.object({ data: SectionIdsSchema }) },
    summary: 'Get the configured Plex library section ids',
  },
  saveSectionIds: {
    method: 'POST',
    path: '/plex/section-ids',
    body: z.object({ movieSectionId: SectionIdInput, tvSectionId: SectionIdInput }),
    responses: { 200: MessageSchema },
    summary: 'Persist the Plex library section ids',
  },
  ...plexSchedulerRoutes,
  ...plexSyncRoutes,
});
