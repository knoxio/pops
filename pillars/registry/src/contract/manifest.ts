/**
 * Structural snapshot of the registry pillar's public surface. The `CoreContract`
 * type lives in `manifest.generated.ts` (regenerate via `pnpm -F @pops/registry
 * generate:manifest`); this file is the stable import path
 * (`@pops/registry/manifest`) so downstream consumers don't move with the
 * generator output, and supplies the runtime `ModuleManifest` value consumed by
 * the workspace discovery walk in `libs/module-registry/scripts/known-modules.ts`.
 *
 * The registry advertises only its own `coreOperationalManifest` settings; the
 * `ai.config` keys belong to the separate `ai` pillar.
 */
import { coreOperationalManifest } from './settings/index.js';

import type { ModuleManifest } from '@pops/types';

export type { CoreContract } from './manifest.generated.js';

export const coreManifest: ModuleManifest = {
  id: 'registry',
  name: 'Registry',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Cross-cutting platform services: settings, features, registry.',
  settings: [coreOperationalManifest],
};
