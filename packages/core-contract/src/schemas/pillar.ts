import { z } from 'zod';

import { PILLAR_STATUSES } from '../types/pillar.js';

export const PillarStatusSchema = z.enum(PILLAR_STATUSES);

export const PillarSchema = z.object({
  pillarId: z.string(),
  baseUrl: z.string(),
  contractPackage: z.string(),
  contractVersion: z.string(),
  contractTag: z.string(),
  status: PillarStatusSchema,
  registeredAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
  statusUpdatedAt: z.string().datetime(),
});
