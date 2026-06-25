# Wire the capability projections into the runtime `pillar()` SDK

The type projection toolkit in `@pops/pillar-sdk/capabilities` (PRD [capability-projection-types](../themes/federation/prds/capability-projection-types.md)) is built and fully tested, but it has **no downstream consumers**. The runtime `pillar()` SDK that actually ships (`@pops/pillar-sdk/client`) was built in parallel and never composed the projections. These are the unbuilt pieces.

## Compose `CallablePillar<C>` into the runtime `pillar()` proxy

Today `client/proxy.ts` derives `PillarHandle<TRouter>` directly from a router type parameter and falls back to `Record<string, ProcedureNode<unknown>>` when the router is opaque. The intended design (the type machinery that makes `pillar('finance').wishlist.list(...)` possible) was for the runtime factory's return type to be `CallablePillar<FinanceContract>`, deriving the proxy shape from the contract's `router` subtree via the projections.

Blocked because REST pillars no longer expose a concrete tRPC router type. The real contract router types are opaque (`FinanceRouter = unknown`, `FoodRouter = unknown`, …) since REST pillars publish OpenAPI, not a tRPC router. With an opaque router, `CallablePillar<C>` projects to nothing useful and `PillarHandle<unknown>` falls back to a fully dynamic handle. To make the projections load-bearing, contracts would need to advertise a `BaseContract`-shaped `router: Record<string, Record<string, ProcedureShape>>` type — e.g. generated from the OpenAPI snapshot — so `CallablePillar` has real route/procedure keys to project.

## Reconcile the two divergent `CallResult` / `PillarCallError` shapes

There are two incompatible `CallResult` definitions in the SDK:

- `capabilities/call-result.ts` — kinds `ok` / `not-found` / `unavailable` / `degraded` / `contract-mismatch` / `validation-error`; `PillarCallError(cause)` carrying `.cause`.
- `client/errors.ts` — kinds `ok` / `unavailable` / `degraded` (with `reason: 'reconciling'`) / `contract-mismatch` / `not-found` / `conflict` / `bad-request` / `unauthorized`, all `pillar`-tagged; `PillarCallError(pillarId, result)` carrying `.result`, plus `isNotFound` / `isConflict` / `isBadRequest` / `isUnauthorized` guards.

The runtime layer's set is the richer, HTTP-mapped one that real call sites use. Converging on a single `CallResult` (likely the client's, lifted into `capabilities` so both layers share it) is needed before the projections can type the runtime SDK. Until then `capabilities` `CallResult` is documentation-grade only.

## A real finance projection pilot

The PRD scoped a pilot demonstrating `CallablePillar<FinanceContract>` against the real finance contract in a stub call site. Not built, and not buildable as specified while `FinanceRouter = unknown`. The projections are only exercised against the synthetic fixture contract in `capabilities/__tests__/fixtures.ts`. A real pilot depends on the two items above (a `BaseContract`-shaped finance contract router type + a single `CallResult`).

## Subscription / streaming projections

`ProcedureShape['_def']['kind']` already admits `'subscription'`, but no projection consumes it — `CallSignature` and `CallablePillar` only model request/response. Subscription typing is deferred until the streaming wire transport lands.
