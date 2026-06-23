/**
 * The ai pillar's settings key authority for the shared `@pops/pillar-settings`
 * surface.
 *
 * The central key enum has been retired — each pillar owns exactly the keys
 * its own manifest declares. The ai pillar owns exactly the `ai.*` keys its
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
 * The `ai.*` setting keys the ai pillar owns — derived from
 * {@link aiConfigManifest} (NOT hand-listed) so the `makeSettingsContract` enum,
 * the reset defaults, and the sensitive set can never drift from the manifest.
 *
 * `deriveKeySet().keys` is `readonly string[]` (not provably non-empty), but
 * `makeSettingsContract` requires a non-empty `[string, ...string[]]` tuple, so
 * we assert non-empty at module load — an empty manifest is a programmer error
 * that should fail boot loudly rather than serve an empty settings surface.
 */
function asNonEmptyKeys(keys: readonly string[]): [string, ...string[]] {
  const [first, ...rest] = keys;
  if (first === undefined) {
    throw new Error(
      'aiConfigManifest declares no settings keys — cannot build the ai settings surface'
    );
  }
  return [first, ...rest];
}

export const AI_SETTINGS_KEYS: [string, ...string[]] = asNonEmptyKeys(manifestKeySet.keys);

/** The ai pillar's effective {@link KeyDefaults} — manifest-derived end to end. */
export const aiKeyDefaults: KeyDefaults = {
  keys: AI_SETTINGS_KEYS,
  defaults: manifestKeySet.defaults,
  sensitive: manifestKeySet.sensitive,
};
