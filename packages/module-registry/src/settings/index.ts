/**
 * Settings manifests live here (PRD-101 US-04 follow-up) so that both the
 * build-time registry (`scripts/known-modules.ts`) and the runtime API
 * (`apps/pops-api`) read from a single source of truth. Pure data, no
 * runtime dependencies beyond `@pops/types`.
 */
export { aiConfigManifest } from './core/ai-manifest.js';
export { coreOperationalManifest } from './core/operational-manifest.js';
export { financeManifest } from './finance/index.js';
export { inventoryManifest } from './inventory/index.js';
export { cerebrumManifest } from './cerebrum/index.js';
export { egoManifest } from './ego/index.js';
export { arrManifest, plexManifest, rotationManifest } from './media/manifests.js';
export { mediaOperationalManifest } from './media/operational-manifest.js';
