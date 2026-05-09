import { navConfig, routes } from './routes';

/**
 * Cerebrum frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'cerebrum',
  name: 'Cerebrum',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Engrams, retrieval, plexus, reflex, glia — knowledge graph and agents.',
  frontend: {
    routes,
    navConfig,
  },
};
