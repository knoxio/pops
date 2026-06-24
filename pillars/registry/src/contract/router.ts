import type { CoreRestContract } from './rest.js';

/**
 * Typed ts-rest contract for the registry pillar.
 *
 * `CoreRouter` is the contract shape consumers reference via
 * `pillar<CoreRouter>('core')`; it is the actual `coreContract` router
 * (`./rest.ts`). The wire-typed sources of truth are the committed OpenAPI
 * projection (`openapi/registry.openapi.json`) and the generated
 * `api-types.generated.ts`.
 */
export type CoreRouter = CoreRestContract;

export { coreContract } from './rest.js';
export type { CoreRestContract } from './rest.js';
