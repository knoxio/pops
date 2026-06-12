import { z } from 'zod';

import { PROJECT_STATUSES } from '../types/project.js';

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ProjectStatusSchema,
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
