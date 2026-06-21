/**
 * The ai pillar's settings key authority for the shared `@pops/pillar-settings`
 * surface.
 *
 * Unlike core (which pins `keys` to the full central `SETTINGS_KEY_VALUES` for
 * S1 wire-compat), the ai pillar owns exactly the `ai.*` keys its own
 * `aiConfigManifest` declares. `deriveKeySet([aiConfigManifest])` is the source
 * of the declared-key set, the reset defaults, and the read-side sensitive set —
 * all three flow from the same manifest so they can never drift.
 *
 * NOTE: the central `ai.*` enum in `packages/types/settings-keys.ts` is NOT
 * shrunk here — that dismantling is owned by the settings-federation plan. The
 * ai pillar simply OWNS serving these keys against its own `settings` table in
 * `ai.db`.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';

import { aiConfigManifest } from './ai-manifest.js';

const manifestKeySet = deriveKeySet([aiConfigManifest]);

/**
 * The `ai.*` setting keys the ai pillar owns, derived from
 * {@link aiConfigManifest}. A non-`readonly` tuple (`[string, ...string[]]`)
 * so `makeSettingsContract`'s `:key` enum accepts it directly while staying
 * statically typed.
 */
export const AI_SETTINGS_KEYS: [string, ...string[]] = [
  'ai.model',
  'ai.modelOverrides.query',
  'ai.modelOverrides.emit',
  'ai.modelOverrides.classifier',
  'ai.modelOverrides.entityExtractor',
  'ai.modelOverrides.scopeInference',
  'ai.modelOverrides.auditorContradiction',
  'ai.modelOverrides.patternContradiction',
  'ai.monthlyTokenBudget',
  'ai.budgetExceededFallback',
  'ai.logRetentionDays',
];

/** The ai pillar's effective {@link KeyDefaults} — manifest-derived end to end. */
export const aiKeyDefaults: KeyDefaults = {
  keys: AI_SETTINGS_KEYS,
  defaults: manifestKeySet.defaults,
  sensitive: manifestKeySet.sensitive,
};
