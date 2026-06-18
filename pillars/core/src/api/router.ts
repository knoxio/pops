/**
 * Root tRPC router for the core pillar container.
 *
 * The procedure paths are intentionally rooted at `core.*` so that the
 * Phase 5 PR 2 dispatcher cutover can be a transparent URL swap rather
 * than a procedure-path rename: existing pops-api clients call
 * `core.serviceAccounts.create`, and core-api answers on the same path.
 */
import { registryRouter } from './modules/registry/router.js';
import { serviceAccountsRouter } from './modules/service-accounts/router.js';
import { settingsRouter } from './modules/settings/router.js';
import { usersRouter } from './modules/users/router.js';
import { router } from './trpc.js';

export const coreRouter = router({
  registry: registryRouter,
  serviceAccounts: serviceAccountsRouter,
  settings: settingsRouter,
  users: usersRouter,
});

export const appRouter = router({
  core: coreRouter,
});

export type AppRouter = typeof appRouter;
