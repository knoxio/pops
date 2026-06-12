import type { AnyTRPCRouter } from '@trpc/server';

/**
 * Opaque tRPC router type for the finance pillar. Until PRD-155 ships the
 * declaration bundler, `FinanceRouter` is the generic `AnyTRPCRouter` —
 * consumers using `pillar<FinanceRouter>('finance')` get a fully opaque
 * `PillarHandle` with no route or procedure keys preserved. The committed
 * OpenAPI snapshot at `openapi/finance.openapi.json` is the wire-typed
 * alternative until PRD-155 lands.
 *
 * This shape was previously `typeof financeRouter` (re-exporting from
 * `@pops/finance-api`), but that import-type closed a build-graph cycle
 * (pillar-sdk → finance-contract → finance-api → pillar-sdk) that broke
 * turbo's `^build` chain and forced every CI workflow to manually
 * pre-build packages in order. PRD-155's declaration bundler will
 * restore the concrete per-procedure types without re-introducing the
 * cycle.
 */
export type FinanceRouter = AnyTRPCRouter;
