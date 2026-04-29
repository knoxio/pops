import { isVecAvailable } from '../../../db.js';
import { getRedisStatus } from '../../../redis.js';

import type { FeatureManifest } from '@pops/types';

/**
 * Core feature manifest — capability-only flags for runtime infra (Redis,
 * sqlite-vec). These are not user-toggleable; they reflect runtime probes.
 */
export const coreFeaturesManifest: FeatureManifest = {
  id: 'core',
  title: 'Core',
  icon: 'Cpu',
  order: 100,
  features: [
    {
      key: 'core.redis',
      label: 'Redis',
      description:
        'Job queues and request cache. When unavailable, the API runs in degraded mode (queues + cache disabled).',
      default: true,
      scope: 'capability',
      capabilityCheck: () => getRedisStatus() === 'ready',
      requiresEnv: ['REDIS_HOST'],
    },
    {
      key: 'cerebrum.vectorSearch',
      label: 'Vector search (sqlite-vec)',
      description:
        'Semantic and hybrid retrieval. Disabled when the sqlite-vec extension fails to load at startup.',
      default: true,
      scope: 'capability',
      capabilityCheck: () => isVecAvailable(),
    },
  ],
};
