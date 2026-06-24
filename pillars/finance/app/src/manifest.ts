import { navConfig, routes } from './routes';

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
