import { navConfig, routes } from './routes';

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
