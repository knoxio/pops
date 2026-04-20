import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, like, sql } from 'drizzle-orm';
import { z } from 'zod';

import { rotationCandidates, rotationExclusions, rotationSources } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { downloadCandidateImpl } from './download-candidate.js';
import { rotationExclusionsProcedures } from './rotation-exclusions-router.js';

export const rotationCandidatesProcedures = {
  ...rotationExclusionsProcedures,

  /** Add a movie to the rotation queue manually. PRD-072 US-05. */
  addToQueue: protectedProcedure
    .input(
      z.object({
        tmdbId: z.number().int().positive(),
        title: z.string().min(1),
        year: z.number().int().optional(),
        rating: z.number().optional(),
        posterPath: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();

      return db.transaction((tx) => {
        const excluded = tx
          .select({ id: rotationExclusions.id })
          .from(rotationExclusions)
          .where(eq(rotationExclusions.tmdbId, input.tmdbId))
          .get();

        if (excluded) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Movie is excluded from rotation',
          });
        }

        let manualSource = tx
          .select()
          .from(rotationSources)
          .where(eq(rotationSources.type, 'manual'))
          .get();

        manualSource ??= tx
          .insert(rotationSources)
          .values({ type: 'manual', name: 'Manual Queue', priority: 5, enabled: 1 })
          .returning()
          .get();

        tx.insert(rotationCandidates)
          .values({
            sourceId: manualSource.id,
            tmdbId: input.tmdbId,
            title: input.title,
            year: input.year ?? null,
            rating: input.rating ?? null,
            posterPath: input.posterPath ?? null,
            status: 'pending',
          })
          .onConflictDoNothing()
          .run();

        return { success: true };
      });
    }),

  /** Check candidate/exclusion status for a movie. PRD-072 US-05. */
  getCandidateStatus: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(({ input }) => {
      const db = getDrizzle();

      const candidate = db
        .select({ status: rotationCandidates.status, id: rotationCandidates.id })
        .from(rotationCandidates)
        .where(eq(rotationCandidates.tmdbId, input.tmdbId))
        .get();

      const excluded = db
        .select({ id: rotationExclusions.id })
        .from(rotationExclusions)
        .where(eq(rotationExclusions.tmdbId, input.tmdbId))
        .get();

      return {
        inQueue: candidate?.status === 'pending',
        candidateId: candidate?.id ?? null,
        candidateStatus: candidate?.status ?? null,
        isExcluded: !!excluded,
      };
    }),

  /** Remove a pending movie from the rotation queue. PRD-072 US-05. */
  removeFromQueue: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const db = getDrizzle();
      const result = db
        .delete(rotationCandidates)
        .where(
          sql`${rotationCandidates.tmdbId} = ${input.tmdbId} AND ${rotationCandidates.status} = 'pending'`
        )
        .run();
      return { success: result.changes > 0 };
    }),

  /** List candidates with pagination, status filter, and title search. */
  listCandidates: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(['pending', 'added', 'skipped', 'excluded']).default('pending'),
          search: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .default({ status: 'pending', limit: 20, offset: 0 })
    )
    .query(({ input }) => {
      const db = getDrizzle();

      const statusFilter = eq(rotationCandidates.status, input.status);
      const whereClause = input.search
        ? and(statusFilter, like(rotationCandidates.title, `%${input.search}%`))
        : statusFilter;

      const items = db
        .select({
          id: rotationCandidates.id,
          sourceId: rotationCandidates.sourceId,
          tmdbId: rotationCandidates.tmdbId,
          title: rotationCandidates.title,
          year: rotationCandidates.year,
          rating: rotationCandidates.rating,
          posterPath: rotationCandidates.posterPath,
          status: rotationCandidates.status,
          discoveredAt: rotationCandidates.discoveredAt,
          sourceName: rotationSources.name,
          sourcePriority: rotationSources.priority,
        })
        .from(rotationCandidates)
        .leftJoin(rotationSources, eq(rotationCandidates.sourceId, rotationSources.id))
        .where(whereClause)
        .orderBy(desc(rotationCandidates.discoveredAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();

      const totalResult = db
        .select({ value: count() })
        .from(rotationCandidates)
        .where(whereClause)
        .get();
      const total = totalResult?.value ?? 0;

      return { items, total };
    }),

  /** Download a candidate: add to Radarr, create POPS library entry, mark as added. */
  downloadCandidate: protectedProcedure
    .input(z.object({ candidateId: z.number().int().positive() }))
    .mutation(async ({ input }) => downloadCandidateImpl(input.candidateId)),
};
