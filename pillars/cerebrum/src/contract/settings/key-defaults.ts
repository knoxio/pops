/**
 * Cerebrum's settings key authority for the shared `@pops/pillar-settings`
 * surface (settings-federation S2).
 *
 * `deriveKeySet([cerebrumManifest, egoManifest])` is the single source of the
 * declared key set, the reset defaults, and the read-side sensitive set —
 * cerebrum's own manifests are the only authority for its keys (no central
 * enum). The pillar serves BOTH the `cerebrum.*` and `ego.*` key spaces from one
 * federated surface, so both manifests feed the same `KeyDefaults`. The same
 * `KeyDefaults` feeds the contract's `:key` enum and the handler's declared-key
 * assertion + default resolution.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';

import { cerebrumManifest, egoManifest } from './index.js';

/** Cerebrum's effective {@link KeyDefaults}, derived from its own manifests. */
export const cerebrumKeyDefaults: KeyDefaults = deriveKeySet([cerebrumManifest, egoManifest]);
