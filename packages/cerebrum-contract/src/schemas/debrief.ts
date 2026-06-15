import { z } from 'zod';

import { DEBRIEF_MEDIA_TYPES, DEBRIEF_SESSION_STATUSES } from '../types/debrief.js';

export const DebriefMediaTypeSchema = z.enum(DEBRIEF_MEDIA_TYPES);

export const DebriefSessionStatusSchema = z.enum(DEBRIEF_SESSION_STATUSES);

export const DebriefSessionSchema = z.object({
  id: z.number().int(),
  watchHistoryId: z.number().int(),
  mediaType: DebriefMediaTypeSchema.nullable(),
  mediaId: z.number().int().nullable(),
  status: DebriefSessionStatusSchema,
  createdAt: z.string(),
});

export const DebriefResultSchema = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  dimensionId: z.number().int(),
  comparisonId: z.number().int().nullable(),
  createdAt: z.string(),
});

export const DebriefStatusSchema = z.object({
  id: z.number().int(),
  mediaType: z.string(),
  mediaId: z.number().int(),
  dimensionId: z.number().int(),
  debriefed: z.number().int(),
  dismissed: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RecordInputSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionId: z.number().int().positive(),
  comparisonId: z.number().int().positive().nullable(),
});

export const DismissInputSchema = z.object({
  sessionId: z.number().int().positive(),
});

export const ListPendingInputSchema = z.object({
  mediaType: DebriefMediaTypeSchema.optional(),
  mediaId: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const CreateInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
  mediaType: DebriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});

export const GetInputSchema = z.object({
  sessionId: z.number().int().positive(),
});

export const GetByMediaInputSchema = z.object({
  mediaType: DebriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});

export const LogWatchCompletionInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
  mediaType: DebriefMediaTypeSchema,
  mediaId: z.number().int().positive(),
});

export const DeleteByWatchHistoryIdInputSchema = z.object({
  watchHistoryId: z.number().int().positive(),
});
