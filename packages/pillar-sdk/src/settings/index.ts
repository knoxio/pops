/**
 * Pillar-scoped settings manifests, re-exported from each pillar's own
 * contract package. With PRD-239 US-01..US-05 all landed, this barrel reads
 * exclusively from the per-pillar packages; the legacy
 * `@pops/module-registry/settings` subpath is no longer consumed here and is
 * scheduled for deletion in PRD-240 US-05.
 *
 * Pure re-export — no shape change, no runtime behaviour change.
 */
export { aiConfigManifest, coreOperationalManifest } from '@pops/core-contract/settings';
export { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';
export { financeManifest } from '@pops/finance-contract/settings';
export { inventoryManifest } from '@pops/inventory-contract/settings';
export {
  arrManifest,
  plexManifest,
  rotationManifest,
  mediaOperationalManifest,
} from '@pops/media-contract/settings';
