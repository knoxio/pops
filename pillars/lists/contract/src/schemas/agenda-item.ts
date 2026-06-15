import { z } from 'zod';

import { AGENDA_ITEM_STATUSES } from '../types/agenda-item.js';

export const AgendaItemStatusSchema = z.enum(AGENDA_ITEM_STATUSES);

export const AgendaItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  scheduledDate: z.string().date(),
  status: AgendaItemStatusSchema,
  notes: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
