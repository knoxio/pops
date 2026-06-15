/**
 * Wire-shape schemas + shared zod helpers for the `cerebrum.debrief.*`
 * surface. Split out of `router.ts` so the procedure modules
 * (`procedures/{read,write,delete}.ts`) stay under the oxlint
 * `max-lines` ceiling without duplicating response shapes.
 *
 * Input schemas live in `@pops/cerebrum-contract/schemas`; this file
 * only carries the response wrappers and the local constants tied to
 * the in-pillar router (no contract churn).
 */
import { z } from 'zod';

import { DebriefResultSchema, DebriefSessionSchema } from '@pops/cerebrum-contract/schemas';

import type { debriefSessions } from '@pops/cerebrum-db';

export const DEFAULT_LIST_PENDING_LIMIT = 50;

export const DebriefResultResponseSchema = z.object({ data: DebriefResultSchema });
export const DebriefSessionResponseSchema = z.object({ data: DebriefSessionSchema });
export const DebriefSessionNullableResponseSchema = z.object({
  data: DebriefSessionSchema.nullable(),
});

const PaginationMetaSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const ListPendingResponseSchema = z.object({
  data: z.array(DebriefSessionSchema),
  pagination: PaginationMetaSchema,
});

export const LogWatchCompletionResponseSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionsQueued: z.number().int().nonnegative(),
});

export const DeleteByWatchHistoryIdResponseSchema = z.object({
  deletedSessions: z.number().int().nonnegative(),
  deletedResults: z.number().int().nonnegative(),
});

export type DebriefSession = z.infer<typeof DebriefSessionSchema>;
export type DebriefResult = z.infer<typeof DebriefResultSchema>;
export type DebriefSessionRow = typeof debriefSessions.$inferSelect;
