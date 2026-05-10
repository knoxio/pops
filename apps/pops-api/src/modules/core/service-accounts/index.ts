export { serviceAccountsRouter } from './router.js';
export {
  authenticateServiceAccount,
  createServiceAccount,
  listServiceAccounts,
  revokeServiceAccount,
  hasScopeFor,
  countActiveServiceAccounts,
  getActiveServiceAccountByPrefix,
  type AuthenticatedServiceAccount,
} from './service.js';
export {
  ServiceAccountSchema,
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  type ServiceAccount,
  type CreateServiceAccountInput,
  type CreatedServiceAccount,
} from './types.js';
export { generateApiKey, parseApiKey, verifySecret } from './key.js';
