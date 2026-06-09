import { navConfig, routes } from './routes';

import type { ModuleManifest } from '@pops/types';

/**
 * @pops/app-lists frontend manifest (PRD-139).
 *
 * Generic lists domain — shopping, packing, todo. Food is the first consumer
 * via PRD-142, but the lists module is theme-agnostic. The `backend.router`
 * slot is populated by PRD-140 when the tRPC procedures for CRUD land.
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
