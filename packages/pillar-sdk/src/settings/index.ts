/**
 * Pillar-scoped settings manifests, re-exported from each pillar's own
 * contract package as the relocation in PRD-239 progresses. Manifests not yet
 * relocated still flow through `@pops/module-registry/settings`; once PRD-239
 * US-01..US-05 land, this barrel reads exclusively from the per-pillar
 * packages and the module-registry subpath is retired by US-06.
 *
 * Pure re-export — no shape change, no runtime behaviour change.
 */
export { aiConfigManifest, coreOperationalManifest } from '@pops/core-contract/settings';
export {
  arrManifest,
  plexManifest,
  rotationManifest,
  mediaOperationalManifest,
} from '@pops/media-contract/settings';
export {
  inventoryManifest,
  financeManifest,
  cerebrumManifest,
  egoManifest,
} from '@pops/module-registry/settings';
