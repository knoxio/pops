/**
 * Registry table barrel.
 *
 * Canonical definitions for registry-owned tables (environments, pillar
 * registry, service accounts, settings, sync job results, user settings)
 * live in this package.
 */
export { environments } from './schema/environments.js';
export { pillarRegistry } from './schema/pillar-registry.js';
export { serviceAccounts } from './schema/service-accounts.js';
export { settings } from './schema/settings.js';
export { syncJobResults } from './schema/sync-job-results.js';
export { userSettings } from './schema/user-settings.js';
