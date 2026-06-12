import { z } from 'zod';

import { MEDIA_KINDS } from '../types/watchlist-item.js';

export const MediaKindSchema = z.enum(MEDIA_KINDS);

export const WatchlistItemSchema = z.object({
  id: z.string(),
  mediaType: MediaKindSchema,
  targetId: z.string(),
  addedAt: z.string().datetime(),
  lastEditedTime: z.string().datetime(),
});
