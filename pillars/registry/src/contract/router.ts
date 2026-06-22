import type { CoreRestContract } from './rest.js';

/**
 * Typed ts-rest contract for the core pillar.
 *
 * `CoreRouter` is the contract shape consumers reference via
 * `pillar<CoreRouter>('core')`. It replaces the opaque tRPC-router shim from
 * the tRPC era — the pillar now serves a real ts-rest surface, so the contract
 * type is the actual `coreContract` router (`./rest.ts`). The wire-typed
 * sources of truth remain the committed OpenAPI projection
 * (`openapi/registry.openapi.json`) and the generated `api-types.generated.ts`.
 */
export type CoreRouter = CoreRestContract;

export { coreContract } from './rest.js';
export type { CoreRestContract } from './rest.js';
