/**
 * Re-export of the service-accounts admin wire schemas, which live in the
 * contract layer (`contract/schemas/service-account-admin.ts`) so the handlers
 * here and the REST contract share a single source of truth.
 *
 * `ServiceAccount` / `ServiceAccountSchema` are local aliases for the contract's
 * `ServiceAccountAdmin` / `ServiceAccountAdminSchema`.
 */
export {
  type CreatedServiceAccount,
  CreatedServiceAccountSchema,
  type CreateServiceAccountInput,
  CreateServiceAccountInputSchema,
  type ServiceAccountAdmin as ServiceAccount,
  ServiceAccountAdminSchema as ServiceAccountSchema,
} from '../../../contract/index.js';
