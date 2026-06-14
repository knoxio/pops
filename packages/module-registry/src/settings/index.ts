/**
 * Settings manifests live here (PRD-101 US-04 follow-up) so that both the
 * build-time registry (`scripts/known-modules.ts`) and the runtime API
 * (`apps/pops-api`) read from a single source of truth. Pure data, no
 * runtime dependencies beyond `@pops/types`.
 */
export { inventoryManifest } from './inventory/index.js';
