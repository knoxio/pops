# Idea: closing the type-generation pipeline gaps

Spun out of the type-generation-pipeline PRD (theme: federation). The shipped
pipeline projects each pillar's contract to a committed OpenAPI document and
each consumer's OpenAPI to a committed typed `@hey-api` client, both
drift-gated in CI. Two gaps remain; neither blocks the load-bearing path
(a producer change that breaks a consumer surfaces at the consumer's typecheck
once regenerated), so both are deferred until a concrete failure makes them
worth the CI cost.

## Not built

### App-side generated-client drift gate

CI gates the **producer** side: every pillar's `generate:openapi` (and
`generate:manifest`) is re-run and diffed in `unit-quality.yml`, and the Rust
`contacts` spec is diffed in `rust-quality.yml`. It does **not** gate the
**consumer** side: nothing re-runs each app's `generate:<id>-client` and fails
on a diff. So a producer can ship an OpenAPI change while a consumer keeps a
stale committed `src/<id>-api/*.gen.ts`, and the consuming app's typecheck
passes against the old client until someone regenerates by hand. The
`openapi-ts.config.ts` files literally carry a `Drift check (TODO: add to CI)`
note.

The fix mirrors the existing producer gate: in `fe-quality.yml` (which already
triggers on `pillars/*/openapi/**`), run every changed app's `generate:*-client`
script and `git diff --exit-code` the `src/*-api/` tree. The generators are
already deterministic (`openapi-ts` + `oxfmt`), so the gate would be stable.
Deferred because the failure mode is a stale-but-compiling client, not a broken
build, and the producer-side gate already catches the more dangerous case
(uncommitted contract drift).

### Binding the runtime `pillar()` proxy to contract types

The runtime cross-pillar SDK is generic over a caller-supplied
`pillar<TRouter>(id)`, and most REST pillars export `Router = unknown`, so
`pillar('inventory')` is fully opaque at the procedure level. The type
machinery to bind a `<Pillar>Contract` to a typed proxy already exists in
`@pops/pillar-sdk/capabilities` (`CallablePillar<C>`, `InputOf`/`OutputOf`,
list-to-union projections) but is **not** connected to the runtime entry point.

The original spec proposed closing this with a `declareContracts<{...}>()`
type-only helper at `@pops/pillar-sdk/declare` plus a `ContractFor<P>`
augmentation that each app calls once at its entry point, so
`pillar('finance').wishlist.list(input)` infers input/output from the finance
contract with no hand-written `TRouter`. None of that exists: no `declare`
subpath, no `ContractFor` map, no per-app declaration site.

This overlaps substantially with two existing ideas — keep the design there
rather than duplicating it:

- [client-surface](client-surface.md) — the `pillar<P extends KnownPillarId>(p): CallablePillar<ContractFor<P>>` signature and the `declareContracts(...)` consumer-side registration helper.
- [capability-projection-types](capability-projection-types.md) — reconciling the two parallel `CallResult` shapes and wiring `client` to derive its proxy from `CallablePillar`.

For most call sites the generated `<id>-api` Hey API client already delivers
full wire types, which is why this binding has stayed deferred: it is an
ergonomics win for the runtime proxy, not a missing capability.

## Why deferred

The pipeline already delivers end-to-end type safety from each producer's zod
schemas to each consumer's call sites, with the dangerous drift case
(uncommitted contract change) gated in CI. The two open items are an extra
guard against a stale-but-compiling artifact and an ergonomics upgrade for a
proxy that has a fully-typed alternative. Build them when a real stale-client
incident or a concrete consumer of the typed proxy shows up.
