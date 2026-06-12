import { z } from 'zod';

import { WISH_LIST_PRIORITIES } from '../types/wish-list-item.js';

export const WishListPrioritySchema = z.enum(WISH_LIST_PRIORITIES);

export const WishListItemSchema = z.object({
  id: z.string(),
  item: z.string(),
  targetAmount: z.number().nullable(),
  saved: z.number().nullable(),
  remainingAmount: z.number().nullable(),
  priority: WishListPrioritySchema.nullable(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
});
