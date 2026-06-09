/**
 * Public surface of the service-accounts module within pops-api.
 *
 * The implementation lives in `@pops/core-db` (core pillar Phase 1). The
 * remaining files in this directory are the tRPC router and its zod
 * contract schemas — the only pieces that stay in pops-api.
 */
export { serviceAccountsRouter } from './router.js';
export {
  ServiceAccountSchema,
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  type ServiceAccount,
  type CreateServiceAccountInput,
  type CreatedServiceAccount,
} from './types.js';
