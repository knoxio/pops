/**
 * Opaque router type for the finance pillar. `@pops/finance` speaks REST now,
 * so there is no concrete tRPC router to import — `FinanceRouter` is `unknown`,
 * meaning consumers using `pillar<FinanceRouter>('finance')` get a fully opaque
 * `PillarHandle` with no route or procedure keys preserved. The committed
 * OpenAPI snapshot at `openapi/finance.openapi.json` is the wire-typed
 * alternative (e.g. for the generated Hey API clients).
 *
 * The type name is retained because the generated manifest and the manifest
 * generator scripts reference it as the `router` field type. Mirrors the
 * food-contract `FoodRouter = unknown` shape.
 */
export type FinanceRouter = unknown;
