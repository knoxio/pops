import type { AnyTRPCRouter } from '@trpc/server';

/**
 * Opaque tRPC router type for the inventory pillar. Mirrors the
 * media-contract pattern: `InventoryRouter` is `AnyTRPCRouter`, so
 * consumers using `pillar<InventoryRouter>('inventory')` get a fully
 * opaque `PillarHandle` with no route or procedure keys preserved. The
 * committed OpenAPI snapshot at `openapi/inventory.openapi.json` is the
 * wire-typed alternative until PRD-155 ships the declaration bundler.
 *
 * Previously `typeof inventoryRouter` re-exported from
 * `@pops/inventory-api`, but PRD-239 had `inventory-api` consume
 * `inventoryManifest` from `@pops/inventory-contract/settings`, closing
 * a `inventory-contract → inventory-api → inventory-contract`
 * build-graph cycle that broke standalone Docker builds that don't ship
 * `apps/pops-inventory-api/src`.
 */
export type InventoryRouter = AnyTRPCRouter;
