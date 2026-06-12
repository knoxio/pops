/**
 * The food pillar's tRPC router *type*. Type-only re-export from
 * `apps/pops-food-api` — no runtime tRPC code crosses the contract
 * boundary. Consumers use this to type the `pillar('food').foo.bar(…)`
 * SDK calls (Epic 05 / PRD-191).
 *
 * `apps/pops-food-api` is still on the Phase 3 scaffold and does not yet
 * expose a `router.ts`, so the type currently falls back to `unknown`.
 * When the router lands, swap this for:
 *
 * ```ts
 * import type { foodRouter } from '@pops/food-api/router';
 * export type FoodRouter = typeof foodRouter;
 * ```
 *
 * The lint rule in PRD-156 stays focused on *value* imports; type-only
 * references through the contract are tolerated as the migration
 * intermediate. A committed OpenAPI snapshot at `openapi/food.openapi.json`
 * is the wire-typed alternative consumers (e.g. iOS Swift codegen) can
 * use instead.
 */
export type FoodRouter = unknown;
