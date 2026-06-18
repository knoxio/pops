/**
 * Root tRPC router for the core pillar container.
 *
 * Phase A of the core-pillar migration retired the per-domain tRPC routers
 * (entities, shell, ai-*, serviceAccounts) — those are served REST-only now.
 * What survives is the set of procedures that sibling pillars / the pillar
 * SDK still call over the wire and that have NO REST replacement the caller
 * uses:
 *
 *   - `core.registry.*` — the discovery contract. `@pops/pillar-sdk`'s
 *     `HttpDiscoveryTransport` fetches the registry snapshot from
 *     `${registryUrl}/trpc/core.registry.list`
 *     (packages/pillar-sdk/src/discovery/fetcher.ts). `GET /pillars` reads a
 *     different source (the static `POPS_PILLARS` env), not the DB-backed
 *     `pillar_registry` table, so it cannot replace `list`/`get`. The
 *     register/heartbeat/deregister mutations are ALSO served by the raw
 *     `POST /core.registry.*` Express routes, but `list`/`get` are not.
 *
 *   - `core.settings.*` — the cross-pillar settings surface. Production media
 *     call sites (Plex/arr/rotation) and the finance pillar reach it via the
 *     server SDK's `pillar('core').settings.{get,set,getMany}`, which POSTs to
 *     `/trpc/core.settings.*` (pinned by `core-settings-sdk-itest.test.ts`).
 *
 *   - `core.users.get` — the URI-owner lookup the finance/inventory crons call
 *     via `pillar('core').users.get({ uri })`
 *     (pillars/finance/src/api/cron/pillar-lookup.ts).
 *
 * Dropping any of these would silently break runtime cross-pillar discovery
 * or lookups, so they stay mounted at `/trpc` until a REST contract replaces
 * each one.
 */
import { registryRouter } from './modules/registry/router.js';
import { settingsRouter } from './modules/settings/router.js';
import { usersRouter } from './modules/users/router.js';
import { router } from './trpc.js';

export const coreRouter = router({
  registry: registryRouter,
  settings: settingsRouter,
  users: usersRouter,
});

export const appRouter = router({
  core: coreRouter,
});

export type AppRouter = typeof appRouter;
