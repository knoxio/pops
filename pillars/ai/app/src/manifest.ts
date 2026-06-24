import { navConfig, routes } from './routes';

/**
 * AI Ops frontend module manifest.
 *
 * **App surface of the `ai` pillar.** This dashboard's generated client targets
 * the `/ai-api` proxy. The shell loads this manifest via `@pops/app-ai` in
 * `WORKSPACE_BUNDLE_MAP` and mounts the routes under `/ai/*`.
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
