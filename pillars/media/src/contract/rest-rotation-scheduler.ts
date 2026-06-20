/**
 * `rotation.*` scheduler routes (slice 11b) — control + observe the
 * in-process rotation-cycle controller (`src/api/cron/rotation-scheduler.ts`)
 * and read the rotation log. Spread into `mediaRotationContract` so operation
 * ids stay `rotation.<route>`.
 *
 * Re-architecture vs the monolith: the monolith armed a `node-cron` task; the
 * pillar drives a recursive `setTimeout` interval via a module-level singleton
 * (cron-parser is not a workspace dep — see the controller header). The wire
 * shapes mirror the legacy `scheduler.*` tRPC procedures (status / toggle /
 * runNow / cancelLeaving / getLeavingMovies / getLastCycleLog / getDiskSpace /
 * listRotationLog / getRotationLogStats).
 */
import { z } from 'zod';

import { ERR_RESPONSES, IdParam } from './rest-schemas.js';

const SchedulerStatusSchema = z.object({
  isRunning: z.boolean(),
  isCycleRunning: z.boolean(),
  intervalMs: z.number(),
  cronExpression: z.string(),
  lastCycleAt: z.string().nullable(),
  lastCycleError: z.string().nullable(),
  nextRunAt: z.string().nullable(),
});

const RotationLogRowSchema = z.object({
  id: z.number(),
  executedAt: z.string(),
  moviesMarkedLeaving: z.number(),
  moviesRemoved: z.number(),
  moviesAdded: z.number(),
  removalsFailed: z.number(),
  freeSpaceGb: z.number(),
  targetFreeGb: z.number(),
  skippedReason: z.string().nullable(),
  details: z.string().nullable(),
});

const CycleResultSchema = z.object({
  moviesMarkedLeaving: z.number(),
  moviesRemoved: z.number(),
  moviesAdded: z.number(),
  removalsFailed: z.number(),
  freeSpaceGb: z.number(),
  targetFreeGb: z.number(),
  skippedReason: z.string().nullable(),
});

const LeavingMovieSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable(),
  rotationExpiresAt: z.string().nullable(),
  rotationMarkedAt: z.string().nullable(),
});

const DiskSchema = z.object({
  path: z.string(),
  label: z.string(),
  freeSpace: z.number(),
  totalSpace: z.number(),
});

export const rotationSchedulerRoutes = {
  schedulerStatus: {
    method: 'GET',
    path: '/rotation/scheduler/status',
    responses: { 200: z.object({ data: SchedulerStatusSchema }) },
    summary: 'Read the rotation scheduler run state + last-cycle stats',
  },
  schedulerToggle: {
    method: 'POST',
    path: '/rotation/scheduler/toggle',
    body: z.object({ enabled: z.boolean(), cronExpression: z.string().min(1).optional() }),
    responses: { 200: z.object({ data: SchedulerStatusSchema }), ...ERR_RESPONSES },
    summary: 'Start or stop the rotation scheduler (persists the enabled flag)',
  },
  schedulerRunNow: {
    method: 'POST',
    path: '/rotation/scheduler/run-now',
    body: z.object({}).optional(),
    responses: {
      200: z.object({
        data: z.object({ success: z.boolean(), result: CycleResultSchema.nullable() }),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Trigger one rotation cycle immediately',
  },
  schedulerLeavingMovies: {
    method: 'GET',
    path: '/rotation/scheduler/leaving',
    responses: { 200: z.object({ data: z.array(LeavingMovieSchema) }) },
    summary: "Movies currently in the 'leaving' state, soonest expiry first",
  },
  schedulerCancelLeaving: {
    method: 'POST',
    path: '/rotation/scheduler/leaving/:movieId/cancel',
    pathParams: z.object({ movieId: IdParam }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ data: z.object({ success: z.boolean(), message: z.string() }) }),
      ...ERR_RESPONSES,
    },
    summary: "Clear a movie's 'leaving' status",
  },
  schedulerLastCycleLog: {
    method: 'GET',
    path: '/rotation/scheduler/last-cycle',
    responses: { 200: z.object({ data: RotationLogRowSchema.nullable() }) },
    summary: 'Read the most recent rotation cycle log entry',
  },
  schedulerDiskSpace: {
    method: 'GET',
    path: '/rotation/scheduler/disk-space',
    responses: {
      200: z.object({ data: z.object({ available: z.boolean(), disks: z.array(DiskSchema) }) }),
    },
    summary: 'Radarr disk space (degrades to available:false when unreachable)',
  },
  listRotationLog: {
    method: 'GET',
    path: '/rotation/scheduler/log',
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
    responses: {
      200: z.object({
        data: z.object({ items: z.array(RotationLogRowSchema), total: z.number() }),
      }),
    },
    summary: 'Paginated rotation log entries, newest first',
  },
  rotationLogStats: {
    method: 'GET',
    path: '/rotation/scheduler/log-stats',
    responses: {
      200: z.object({
        data: z.object({
          totalRotated: z.number(),
          avgPerDay: z.number(),
          streak: z.number(),
        }),
      }),
    },
    summary: 'Summary statistics for the rotation log page',
  },
} as const;
