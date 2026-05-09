import { navConfig, routes } from './routes';

/**
 * Finance frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'finance',
  name: 'Finance',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Transactions, budgets, entities, and import pipeline.',
  frontend: {
    routes,
    navConfig,
  },
};
