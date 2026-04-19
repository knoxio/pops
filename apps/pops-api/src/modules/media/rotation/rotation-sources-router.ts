import { TRPCError } from '@trpc/server';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { rotationCandidates, rotationSources } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { fetchPlexFriends } from '../plex/friends.js';
import { getPlexToken } from '../plex/service.js';
import { getRegisteredTypes } from './source-registry.js';
import { syncSource } from './sync-source.js';

export const rotationSourcesProcedures = {
  /** Sync a specific rotation source (fetch candidates from adapter). */
  syncSource: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return syncSource(input.sourceId);
    }),

  /** List registered source adapter types. */
  sourceTypes: protectedProcedure.query(() => {
    return { types: getRegisteredTypes() };
  }),

  /** List available Plex friends (for source config UI picker). */
  listPlexFriends: protectedProcedure.query(async () => {
    const token = getPlexToken();
    if (!token) {
      return { friends: [], error: 'Plex token not configured' };
    }
    try {
      const friends = await fetchPlexFriends(token);
      return { friends, error: null };
    } catch (err) {
      return {
        friends: [],
        error: err instanceof Error ? err.message : 'Failed to fetch Plex friends',
      };
    }
  }),

  /** List all configured sources with candidate counts. */
  listSources: protectedProcedure.query(() => {
    const db = getDrizzle();
    return db
      .select({
        id: rotationSources.id,
        type: rotationSources.type,
        name: rotationSources.name,
        priority: rotationSources.priority,
        enabled: rotationSources.enabled,
        config: rotationSources.config,
        lastSyncedAt: rotationSources.lastSyncedAt,
        syncIntervalHours: rotationSources.syncIntervalHours,
        createdAt: rotationSources.createdAt,
        candidateCount: count(rotationCandidates.id),
      })
      .from(rotationSources)
      .leftJoin(rotationCandidates, eq(rotationSources.id, rotationCandidates.sourceId))
      .groupBy(rotationSources.id)
      .orderBy(desc(rotationSources.priority))
      .all();
  }),

  /** Create a new rotation source. */
  createSource: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1),
        name: z.string().min(1),
        priority: z.number().int().min(1).max(10).default(5),
        enabled: z.boolean().default(true),
        config: z.record(z.string(), z.unknown()).default({}),
        syncIntervalHours: z.number().int().min(1).default(24),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      return db
        .insert(rotationSources)
        .values({
          type: input.type,
          name: input.name,
          priority: input.priority,
          enabled: input.enabled ? 1 : 0,
          config: JSON.stringify(input.config),
          syncIntervalHours: input.syncIntervalHours,
        })
        .returning()
        .get();
    }),

  /** Update an existing rotation source. */
  updateSource: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        priority: z.number().int().min(1).max(10).optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        syncIntervalHours: z.number().int().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
      if (input.config !== undefined) updates.config = JSON.stringify(input.config);
      if (input.syncIntervalHours !== undefined)
        updates.syncIntervalHours = input.syncIntervalHours;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });
      }

      const result = db
        .update(rotationSources)
        .set(updates)
        .where(eq(rotationSources.id, input.id))
        .run();

      return { success: result.changes > 0 };
    }),

  /** Delete a rotation source and its candidates. */
  deleteSource: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      const db = getDrizzle();

      const source = db
        .select({ type: rotationSources.type })
        .from(rotationSources)
        .where(eq(rotationSources.id, input.id))
        .get();

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source not found' });
      }
      if (source.type === 'manual') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete the manual source' });
      }

      db.transaction((tx) => {
        tx.delete(rotationCandidates).where(eq(rotationCandidates.sourceId, input.id)).run();
        tx.delete(rotationSources).where(eq(rotationSources.id, input.id)).run();
      });

      return { success: true };
    }),
};
