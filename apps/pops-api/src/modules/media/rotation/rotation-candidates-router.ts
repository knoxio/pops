import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, like, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  movies,
  rotationCandidates,
  rotationExclusions,
  rotationSources,
  settings,
} from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { getRadarrClient } from '../arr/service.js';
import { addMovie as addMovieToLibrary } from '../library/service.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';

export const rotationCandidatesProcedures = {
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
    .mutation(async ({ input }) => {
      const db = getDrizzle();
      const candidate = db
        .select()
        .from(rotationCandidates)
        .where(eq(rotationCandidates.id, input.candidateId))
        .get();

      if (!candidate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' });
      }
      if (candidate.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Candidate is already ${candidate.status}`,
        });
      }

      const client = getRadarrClient();
      if (!client) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Radarr not configured',
        });
      }

      const qualityProfileId = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'rotation_quality_profile_id'))
        .get()?.value;
      const rootFolderPath = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'rotation_root_folder_path'))
        .get()?.value;

      if (!qualityProfileId || !rootFolderPath) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Radarr quality profile or root folder not configured',
        });
      }

      const check = await client.checkMovie(candidate.tmdbId);
      if (check.exists) {
        db.update(rotationCandidates)
          .set({ status: 'added' })
          .where(eq(rotationCandidates.id, input.candidateId))
          .run();
        return { success: true, alreadyInRadarr: true };
      }

      await client.addMovie({
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year ?? new Date().getFullYear(),
        qualityProfileId: Number(qualityProfileId),
        rootFolderPath,
      });

      try {
        const tmdbClient = getTmdbClient();
        const imageCache = getImageCache();
        await addMovieToLibrary(candidate.tmdbId, tmdbClient, imageCache);
      } catch (err) {
        console.warn(
          '[rotation] Failed to create library entry for tmdb=%d:',
          candidate.tmdbId,
          err
        );
      }

      db.update(rotationCandidates)
        .set({ status: 'added' })
        .where(eq(rotationCandidates.id, input.candidateId))
        .run();

      db.update(movies)
        .set({ rotationStatus: 'protected' })
        .where(eq(movies.tmdbId, candidate.tmdbId))
        .run();

      return { success: true, alreadyInRadarr: false };
    }),
};
