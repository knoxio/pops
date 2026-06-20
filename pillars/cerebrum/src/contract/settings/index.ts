/**
 * Cerebrum-scoped settings manifests. Re-exports the cerebrum and ego sub-domain
 * manifests so consumers (e.g. `@pops/pillar-sdk/settings`) can pull from the
 * pillar contract package rather than `@pops/module-registry/settings`.
 */
export { cerebrumManifest } from './cerebrum/index.js';
export { egoManifest } from './ego/index.js';
