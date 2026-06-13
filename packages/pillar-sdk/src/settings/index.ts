/**
 * Pillar-scoped settings manifests, re-exported from `@pops/module-registry`
 * so consumers can migrate off the legacy `@pops/module-registry/settings`
 * subpath onto the SDK surface (PRD-238 US-01, Option B).
 *
 * Pure re-export — no shape change, no runtime behaviour change. The legacy
 * subpath is retired once US-01 flips all eight call sites and US-02 deletes
 * `@pops/module-registry/settings`.
 */
export {
  aiConfigManifest,
  coreOperationalManifest,
  inventoryManifest,
  financeManifest,
  cerebrumManifest,
  egoManifest,
  arrManifest,
  plexManifest,
  rotationManifest,
  mediaOperationalManifest,
} from '@pops/module-registry/settings';
