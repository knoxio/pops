/**
 * Re-export of the service-accounts admin wire schemas, which now live in
 * the contract layer (`contract/schemas/service-account-admin.ts`) so the
 * tRPC router here and the REST contract share a single source of truth.
 *
 * The local `ServiceAccount` / `ServiceAccountSchema` names are preserved as
 * aliases so the router and its tests keep importing them unchanged.
 */
export {
  type CreatedServiceAccount,
  CreatedServiceAccountSchema,
  type CreateServiceAccountInput,
  CreateServiceAccountInputSchema,
  type ServiceAccountAdmin as ServiceAccount,
  ServiceAccountAdminSchema as ServiceAccountSchema,
} from '../../../contract/index.js';
