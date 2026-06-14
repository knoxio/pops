/**
 * Pillar-scoped settings manifests, re-exported from per-pillar contract
 * packages so consumers can pull settings off the SDK surface (PRD-238 US-01,
 * Option B). Media now lives in `@pops/media-contract/settings` (PRD-239
 * US-05); the remaining manifests still ride on `@pops/module-registry/settings`
 * until they are relocated.
 *
 * Pure re-export — no shape change, no runtime behaviour change.
 */
export {
  arrManifest,
  plexManifest,
  rotationManifest,
  mediaOperationalManifest,
} from '@pops/media-contract/settings';
export {
  aiConfigManifest,
  coreOperationalManifest,
  inventoryManifest,
  financeManifest,
  cerebrumManifest,
  egoManifest,
} from '@pops/module-registry/settings';
