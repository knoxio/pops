import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Plex tRPC router — sync operations and connection management.
 *
 * All sync operations run as background jobs via the sync job manager.
 * The startSyncJob mutation returns immediately with a job ID.
 * The frontend polls getSyncJobStatus for progress and results.
 */
import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import { PlexClient } from './client.js';
import * as scheduler from './scheduler.js';
import * as plexService from './service.js';
import {
  getActiveJobs,
  getJob,
  getLastCompletedJobs,
  startJob,
  SYNC_JOB_TYPES,
} from './sync-job-manager.js';
import { PlexApiError } from './types.js';

function requirePlexClient(): PlexClient {
  const client = plexService.getPlexClient();
  if (!client) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Plex is not configured. Connect to Plex in settings first.',
    });
  }
  return client;
}

export const plexRouter = router({
  testConnection: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const connected = await plexService.testConnection(client);
      return { data: { connected } };
    } catch (err) {
      if (err instanceof PlexApiError) {
        return { data: { connected: false, error: err.message } };
      }
      throw err;
    }
  }),

  getLibraries: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const libraries = await client.getLibraries();
      return { data: libraries };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  // ---------------------------------------------------------------------------
  // Background sync jobs
  // ---------------------------------------------------------------------------

  /** Start a background sync job. Returns immediately with the job ID. */
  startSyncJob: protectedProcedure
    .input(
      z.object({
        jobType: z.enum(SYNC_JOB_TYPES),
        sectionId: z.string().min(1).optional(),
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      requirePlexClient();
      try {
        const jobId = startJob(input.jobType, {
          sectionId: input.sectionId,
          movieSectionId: input.movieSectionId,
          tvSectionId: input.tvSectionId,
        });
        return { data: { jobId } };
      } catch (err) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),

  /** Poll for the status of a sync job (progress, result, error). */
  getSyncJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      }
      return { data: job };
    }),

  /** Get all currently running sync jobs (for restoring UI state on page load). */
  getActiveSyncJobs: protectedProcedure.query(() => {
    return { data: getActiveJobs() };
  }),

  /** Get the most recent completed result for each sync type ("last synced" display). */
  getLastSyncResults: protectedProcedure.query(() => {
    return { data: getLastCompletedJobs() };
  }),

  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  setUrl: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      let finalUrl = input.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `http://${finalUrl}`;
      }

      try {
        new URL(finalUrl);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Invalid URL format. Please provide a valid address (e.g., http://192.168.1.100:32400)',
        });
      }

      const db = getDrizzle();
      const tokenRecord = db
        .select()
        .from(settings)
        .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
        .get();
      const token = tokenRecord?.value;

      try {
        if (token) {
          console.warn(`[Plex] Validating full connection to ${finalUrl}...`);
          const testClient = new PlexClient(finalUrl, token);
          await testClient.getLibraries();
        } else {
          console.warn(`[Plex] Validating reachability for ${finalUrl}...`);
          const controller = new AbortController();
          const id = setTimeout(() => {
            controller.abort();
          }, 5000);

          try {
            const res = await fetch(`${finalUrl}/identity`, {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
            });
            if (!res.ok && res.status !== 401) {
              throw new Error(`Server responded with ${res.status}`);
            }
          } finally {
            clearTimeout(id);
          }
        }
      } catch (err) {
        console.error(`[Plex] Connection validation failed for ${finalUrl}:`, err);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Could not connect to Plex server at ${finalUrl}. Verify the address is correct and the server is reachable.`,
        });
      }

      console.warn(`[Plex] Updating server URL to: ${finalUrl}`);
      db.insert(settings)
        .values({ key: SETTINGS_KEYS.PLEX_URL, value: finalUrl })
        .onConflictDoUpdate({ target: settings.key, set: { value: finalUrl } })
        .run();

      return { message: 'Plex URL updated and validated' };
    }),

  getPlexUrl: protectedProcedure.query(() => {
    return { data: plexService.getPlexUrl() };
  }),

  startScheduler: protectedProcedure
    .input(
      z
        .object({
          intervalMs: z.number().int().positive().optional(),
          movieSectionId: z.string().min(1).optional(),
          tvSectionId: z.string().min(1).optional(),
        })
        .optional()
    )
    .mutation(({ input }) => {
      const status = scheduler.startScheduler(input ?? {});
      return { data: status };
    }),

  stopScheduler: protectedProcedure.mutation(() => {
    const status = scheduler.stopScheduler();
    return { data: status };
  }),

  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),

  getSyncLogs: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ input }) => {
      return { data: scheduler.getSyncLogs(input?.limit ?? 20) };
    }),

  getSectionIds: protectedProcedure.query(() => {
    return { data: plexService.getPlexSectionIds() };
  }),

  saveSectionIds: protectedProcedure
    .input(
      z.object({
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      plexService.savePlexSectionIds(input.movieSectionId, input.tvSectionId);
      return { message: 'Section IDs saved' };
    }),

  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = plexService.getPlexClientId();
    const res = await fetch('https://plex.tv/api/v2/pins?strong=false', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': 'POPS',
        'X-Plex-Client-Identifier': clientId,
      },
    });
    if (!res.ok) {
      const status = res.status;
      throw new TRPCError({
        code: status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        message: `Failed to get Plex PIN (HTTP ${status})`,
      });
    }
    const data = (await res.json()) as { id: number; code: string };
    return { data: { id: data.id, code: data.code, clientId } };
  }),

  checkAuthPin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const clientId = plexService.getPlexClientId();
      const res = await fetch(`https://plex.tv/api/v2/pins/${input.id}`, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Client-Identifier': clientId,
        },
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 404) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Invalid or expired PIN ID',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to check Plex PIN (HTTP ${status})`,
        });
      }

      const data = (await res.json()) as {
        authToken?: string | null;
        expiresAt?: string | null;
        username?: string | null;
      };

      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt.getTime() < Date.now()) {
          return { data: { connected: false, expired: true } };
        }
      }

      console.warn(
        `[Plex] PIN check response for ${input.id}:`,
        data.authToken ? 'Token received' : 'No token yet'
      );

      if (data.authToken) {
        const db = getDrizzle();
        console.warn(`[Plex] Encrypting and saving token to database...`);
        const encryptedToken = plexService.encryptToken(data.authToken);
        db.insert(settings)
          .values({ key: SETTINGS_KEYS.PLEX_TOKEN, value: encryptedToken })
          .onConflictDoUpdate({ target: settings.key, set: { value: encryptedToken } })
          .run();

        if (data.username) {
          db.insert(settings)
            .values({ key: SETTINGS_KEYS.PLEX_USERNAME, value: data.username })
            .onConflictDoUpdate({ target: settings.key, set: { value: data.username } })
            .run();
        }

        return { data: { connected: true, username: data.username ?? null } };
      }
      return { data: { connected: false, expired: false } };
    }),

  getPlexUsername: protectedProcedure.query(() => {
    return { data: plexService.getPlexUsername() };
  }),

  disconnect: protectedProcedure.mutation(() => {
    const db = getDrizzle();
    db.delete(settings)
      .where(inArray(settings.key, [SETTINGS_KEYS.PLEX_TOKEN, SETTINGS_KEYS.PLEX_USERNAME]))
      .run();
    return { message: 'Disconnected from Plex' };
  }),
});
