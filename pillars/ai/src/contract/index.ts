/**
 * Barrel for `@pops/ai`'s public contract surface. The `aiContract`
 * ts-rest router is the canonical wire declaration; `./manifest` (the structural
 * `ModuleManifest`) and `./api-types` (the generated openapi types) are the
 * preferred sub-path imports for the registry/SDK and FE client paths.
 */
export { aiContract } from './rest.js';
export { aiManifest } from './manifest.js';
