import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

/**
 * @pops/app-lists frontend manifest.
 *
 * Generic lists domain — shopping, packing, todo. Theme-agnostic; food is the
 * first consumer. Frontend-only: this surface registers routes and nav with
 * the shell, while CRUD goes over the lists pillar's REST contract.
 */
export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'lists',
  name: 'Lists',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Generic lists — shopping, packing, todo. Food is the first consumer.',
  frontend: {
    routes,
    navConfig,
  },
};
