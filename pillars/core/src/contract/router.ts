import type { AnyTRPCRouter } from '@trpc/server';

/**
 * Opaque tRPC router type for the core pillar. Until PRD-155 ships the
 * declaration bundler, `CoreRouter` is the generic `AnyTRPCRouter` —
 * consumers using `pillar<CoreRouter>('core')` get a fully opaque
 * `PillarHandle` with no route or procedure keys preserved. The committed
 * OpenAPI snapshot at `openapi/core.openapi.json` is the wire-typed
 * alternative until PRD-155 lands.
 *
 * This shape was previously `typeof coreRouter` (re-exporting from
 * `@pops/core-api`), but that import-type closed a build-graph cycle
 * (`pillar-sdk → core-contract → core-api → pillar-sdk`) once
 * `pillar-sdk/settings` re-exported `aiConfigManifest` from this package
 * (PRD-239 US-01). Mirrors the precedent established for
 * `@pops/finance-contract` in #2998.
 */
export type CoreRouter = AnyTRPCRouter;
