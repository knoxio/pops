import { z } from 'zod';

import { NUDGE_STATUSES } from '../types/nudge.js';

export const NudgeStatusSchema = z.enum(NUDGE_STATUSES);

export const NudgeSchema = z.object({
  id: z.string(),
  message: z.string(),
  status: NudgeStatusSchema,
  scheduledFor: z.string().datetime(),
  dispatchedAt: z.string().datetime().nullable(),
  lastEditedTime: z.string().datetime(),
});
