/**
 * `plex.*` scheduler routes — control + observe the in-process periodic
 * sync scheduler (slice 9c). Merged into `mediaPlexContract` so operation
 * ids stay `plex.<route>`.
 *
 * Re-architecture vs the monolith: the monolith armed a BullMQ repeatable
 * job; the pillar drives a recursive `setTimeout` via a module-level
 * singleton controller (`src/api/cron/plex-scheduler.ts`). The wire shapes
 * mirror the legacy `startScheduler` / `stopScheduler` / `getSchedulerStatus`
 * / `getSyncLogs` procedures.
 *
 * Gate: a tick runs ONLY movies / tv / watchlist sync. The Plex Discover
 * watch sync is deferred to wave 3.
 */
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const SchedulerStatusSchema = z.object({
  isRunning: z.boolean(),
  intervalMs: z.number(),
  lastSyncAt: z.string().nullable(),
  lastSyncError: z.string().nullable(),
  nextSyncAt: z.string().nullable(),
  moviesSynced: z.number(),
  tvShowsSynced: z.number(),
});

const SyncLogSchema = z.object({
  id: z.number(),
  syncedAt: z.string(),
  moviesSynced: z.number(),
  tvShowsSynced: z.number(),
  errors: z.array(z.string()).nullable(),
  durationMs: z.number().nullable(),
});

const SectionId = z.string().min(1).optional();

export const plexSchedulerRoutes = {
  startScheduler: {
    method: 'POST',
    path: '/plex/scheduler/start',
    body: z.object({
      intervalMs: z.number().int().positive().optional(),
      movieSectionId: SectionId,
      tvSectionId: SectionId,
    }),
    responses: { 200: z.object({ data: SchedulerStatusSchema }), ...ERR_RESPONSES },
    summary: 'Arm the periodic Plex sync scheduler (fires one tick immediately)',
  },
  stopScheduler: {
    method: 'POST',
    path: '/plex/scheduler/stop',
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: SchedulerStatusSchema }), ...ERR_RESPONSES },
    summary: 'Stop the periodic Plex sync scheduler',
  },
  getSchedulerStatus: {
    method: 'GET',
    path: '/plex/scheduler/status',
    responses: { 200: z.object({ data: SchedulerStatusSchema }) },
    summary: 'Read the scheduler run state + last-sync stats',
  },
  getSyncLogs: {
    method: 'GET',
    path: '/plex/scheduler/sync-logs',
    query: z.object({ limit: z.coerce.number().int().positive().max(100).optional() }),
    responses: { 200: z.object({ data: z.array(SyncLogSchema) }) },
    summary: 'List recent periodic-sync log entries (newest first)',
  },
} as const;
