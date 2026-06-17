/**
 * Wire schemas for `cerebrum.debrief.*` (PRD-248).
 *
 * The cerebrum debrief subsystem stores a post-watch reflection session per
 * (re-)watch and records per-dimension reflection outcomes. `watchHistoryId`,
 * `mediaType`/`mediaId`, `dimensionId` and `comparisonId` are soft pointers
 * into the media pillar (ADR-026) — no cross-DB FK, no cross-pillar call.
 *
 * The shapes mirror the cerebrum-db drizzle rows one-to-one (the contract is
 * the wire shape, not a UI projection). Defined locally so the pillar contract
 * stays self-contained; lives in its own file so the contract module stays
 * under the oxlint `max-lines` cap.
 */
import { z } from 'zod';

export const debriefMediaTypeSchema = z.enum(['movie', 'episode']);
export type DebriefMediaTypeWire = z.infer<typeof debriefMediaTypeSchema>;

export const debriefSessionStatusSchema = z.enum(['pending', 'active', 'complete']);
export type DebriefSessionStatusWire = z.infer<typeof debriefSessionStatusSchema>;

/** A single post-watch debrief session — one row per (re-)watch. */
export const debriefSessionSchema = z.object({
  id: z.number().int(),
  watchHistoryId: z.number().int(),
  mediaType: debriefMediaTypeSchema.nullable(),
  mediaId: z.number().int().nullable(),
  status: debriefSessionStatusSchema,
  createdAt: z.string(),
});
export type DebriefSessionWire = z.infer<typeof debriefSessionSchema>;

/** A per-session, per-dimension reflection outcome. */
export const debriefResultSchema = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  dimensionId: z.number().int(),
  comparisonId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type DebriefResultWire = z.infer<typeof debriefResultSchema>;

export const debriefPaginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const debriefSessionResponseSchema = z.object({ data: debriefSessionSchema });
export const debriefSessionNullableResponseSchema = z.object({
  data: debriefSessionSchema.nullable(),
});
export const debriefResultResponseSchema = z.object({ data: debriefResultSchema });
export const debriefListPendingResponseSchema = z.object({
  data: z.array(debriefSessionSchema),
  pagination: debriefPaginationSchema,
});
export const debriefLogWatchCompletionResponseSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionsQueued: z.number().int().nonnegative(),
});
export const debriefDeleteByWatchHistoryResponseSchema = z.object({
  deletedSessions: z.number().int().nonnegative(),
  deletedResults: z.number().int().nonnegative(),
});

export const debriefGetInputSchema = z.object({
  sessionId: z.number().int().positive(),
});
export const debriefGetByMediaInputSchema = z.object({
  mediaType: debriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});
export const debriefListPendingInputSchema = z.object({
  mediaType: debriefMediaTypeSchema.optional(),
  mediaId: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});
export const debriefRecordInputSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
  comparisonId: z.number().int().positive().nullable(),
});
export const debriefCreateInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
  mediaType: debriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});
export const debriefLogWatchCompletionInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
  mediaType: debriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});
export const debriefSessionIdParamsSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});
export const debriefDeleteByWatchHistoryInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
});
