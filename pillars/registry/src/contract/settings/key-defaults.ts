/**
 * The registry pillar's settings key authority for the shared
 * `@pops/pillar-settings` surface (settings-federation).
 *
 * The registry derives its declared key set, reset defaults, and read-side
 * sensitive set from its OWN manifest (`coreOperationalManifest`) only. It no
 * longer serves `ai.*` keys: the extracted `ai` pillar owns and advertises
 * `ai.config`, and (since the per-pillar `capabilities.settings` flip) the
 * shell routes `ai.*` reads/writes to that pillar — so the registry's `:key`
 * enum no longer needs to carry them (crossPlanConflict #3).
 *
 * `keys` (the wire enum and the handler's declared-key assertion) and
 * `defaults`/`sensitive` now all flow from the same manifest-derived
 * {@link KeyDefaults}, so the contract factory and handler factory share one
 * source of truth.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';

import { coreOperationalManifest } from './index.js';

/**
 * The registry's effective {@link KeyDefaults}, derived solely from
 * `coreOperationalManifest`: its declared keys, manifest defaults, and
 * sensitive flags.
 */
export const coreKeyDefaults: KeyDefaults = deriveKeySet([coreOperationalManifest]);
