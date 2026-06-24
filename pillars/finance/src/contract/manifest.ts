/**
 * Stable import path (`@pops/finance/manifest`) for the finance pillar's
 * public surface. The `FinanceContract` type is regenerated into
 * `manifest.generated.ts`; this file re-exports it so consumers don't move
 * with the generator output, and carries the runtime `ModuleManifest` value
 * the registry self-registration uses.
 */
import { financeManifest as financeSettingsManifest } from './settings/index.js';

import type { ModuleManifest } from '@pops/types';

export type { FinanceContract } from './manifest.generated.js';

export const financeManifest: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Transactions, budgets, entities, and import pipeline.',
  settings: [financeSettingsManifest],
};
