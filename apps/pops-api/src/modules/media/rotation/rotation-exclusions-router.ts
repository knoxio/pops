import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { rotationCandidates, rotationExclusions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';

export const rotationExclusionsProcedures = {
  /** List exclusion entries, ordered by most recent first. */
  listExclusions: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 50, offset: 0 })
    )
    .query(({ input }) => {
      const db = getDrizzle();
      const items = db
        .select()
        .from(rotationExclusions)
        .orderBy(desc(rotationExclusions.excludedAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
      const totalRow = db.select({ total: count() }).from(rotationExclusions).get();
      const total = totalRow?.total ?? 0;
      return { items, total };
    }),

  /** Exclude a candidate — add to exclusion list and mark candidate as excluded. */
  excludeCandidate: protectedProcedure
    .input(
      z.object({
        tmdbId: z.number().int().positive(),
        title: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      db.insert(rotationExclusions)
        .values({
          tmdbId: input.tmdbId,
          title: input.title,
          reason: input.reason ?? null,
        })
        .onConflictDoNothing()
        .run();
      db.update(rotationCandidates)
        .set({ status: 'excluded' })
        .where(eq(rotationCandidates.tmdbId, input.tmdbId))
        .run();
      return { success: true };
    }),

  /** Remove a movie from the exclusion list. Resets matching candidate to pending. */
  removeExclusion: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const db = getDrizzle();
      const result = db
        .delete(rotationExclusions)
        .where(eq(rotationExclusions.tmdbId, input.tmdbId))
        .run();
      if (result.changes > 0) {
        db.update(rotationCandidates)
          .set({ status: 'pending' })
          .where(eq(rotationCandidates.tmdbId, input.tmdbId))
          .run();
      }
      return { success: result.changes > 0 };
    }),
};
