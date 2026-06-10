import { navConfig, routes } from './routes';

/**
 * AI Ops frontend module manifest (PRD-098).
 *
 * **UI-only module owned by the core pillar.** AI Ops has no per-pillar
 * `@pops/ai-db` package and no `pops-ai-api` container; its backend
 * lives in `apps/pops-api/src/modules/core/{ai-budgets,ai-observability,
 * ai-alerts,ai-usage,ai-providers}`, and the shell's
 * `pillarIdForModule('ai')` returns `'core'` permanently per the Track I
 * fold (see `.claude/pillar-migration-roadmap.md`).
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
