import type { AnyTRPCRouter } from '@trpc/server';

/**
 * Opaque tRPC router type for the cerebrum pillar. Mirrors the finance-contract
 * pattern: until PRD-155 ships the declaration bundler, `CerebrumRouter` is the
 * generic `AnyTRPCRouter` — consumers using `pillar<CerebrumRouter>('cerebrum')`
 * get a fully opaque `PillarHandle` with no route or procedure keys preserved.
 * The committed OpenAPI snapshot at `openapi/cerebrum.openapi.json` is the
 * wire-typed alternative until PRD-155 lands.
 *
 * This shape was previously `typeof cerebrumRouter` (re-exporting from
 * `@pops/cerebrum-api`), but that import-type closed a build-graph cycle
 * (pillar-sdk → cerebrum-contract → cerebrum-api → pillar-sdk) once
 * `@pops/pillar-sdk/settings` started pulling `cerebrumManifest` and
 * `egoManifest` from this package (PRD-239 US-04). PRD-155's declaration
 * bundler will restore the concrete per-procedure types without re-introducing
 * the cycle.
 */
export type CerebrumRouter = AnyTRPCRouter;
