/**
 * Backend-safe barrel for the core domain's persistence layer.
 *
 * Hosts cross-cutting platform tables that every other pillar depends on
 * (service accounts, settings, AI Ops, pillar registry). Extracted from
 * `apps/pops-api/src/modules/core/` as the pilot for ADR-026.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `service-accounts` slice. The
 * other slices (settings, AI Ops, URI dispatcher, pillars registry) follow
 * in subsequent PRs.
 */
export * from './errors.js';
export * from './schema.js';

export type { CoreDb } from './services/internal.js';

export * as serviceAccountsService from './services/service-accounts.js';
export * as serviceAccountKeys from './services/service-account-keys.js';
