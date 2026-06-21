/**
 * Structural `ModuleManifest` for the ai pillar — the source the module
 * registry's discovery walk consumes (PRD-241) via the package's `./manifest`
 * export. Previously inlined in `@pops/core`'s contract package while AI Ops
 * lived inside core; now owned here as a first-class pillar (PRD-055).
 *
 * `surfaces: ['app']` — the AI usage dashboard (`@pops/app-ai`) is the pillar's
 * UI surface, loaded by the shell via the in-repo bundle map.
 */
import { aiConfigManifest } from './settings/ai-manifest.js';

import type { ModuleManifest } from '@pops/types';

export const aiManifest: ModuleManifest = {
  id: 'ai',
  name: 'AI Ops',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'AI usage, providers, model config, prompts, and rules browser.',
  settings: [aiConfigManifest],
};
