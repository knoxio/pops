import { navConfig, routes } from './routes';

/**
 * AI Ops frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'ai',
  name: 'AI Ops',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'AI usage, providers, model config, prompts, and rules browser.',
  frontend: {
    routes,
    navConfig,
  },
};
