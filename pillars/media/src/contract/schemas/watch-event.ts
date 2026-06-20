import { z } from 'zod';

import { MediaKindSchema } from './watchlist-item.js';

export const WatchEventSchema = z.object({
  id: z.string(),
  mediaType: MediaKindSchema,
  targetId: z.string(),
  watchedAt: z.string().datetime(),
  progressPercent: z.number().min(0).max(100).nullable(),
  lastEditedTime: z.string().datetime(),
});
