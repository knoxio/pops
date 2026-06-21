import { navConfig, routes } from './routes';

/**
 * Inventory frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'inventory',
  name: 'Inventory',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Home items, locations, connections, warranties, and documents.',
  frontend: {
    routes,
    navConfig,
  },
};
