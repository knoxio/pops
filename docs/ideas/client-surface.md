# Idea: typed `pillar()` capability projection

Bind the `pillar()` client surface to per-pillar contract types so consumers stop hand-rolling the
router shape they pass as `TRouter`.

> Related PRD: [client-surface](../themes/federation/prds/client-surface/README.md)

## Problem

The runtime `pillar()` is fully built and REST-backed, but its signature is the unconstrained
`pillar<TRouter>(pillarId: string)`. Every call site declares its own `TRouter` (or imports the
pillar's `AppRouter`) and passes the pillar id as a plain string. Nothing ties a pillar id to its
contract at compile time. The type machinery to do this exists in
`@pops/pillar-sdk/capabilities` (`CallablePillar<C>`, `InputOf` / `OutputOf` / `CallSignature`
projections over a `BaseContract`) but is not connected to the entry point.

## Proposed surface

```ts
pillar<P extends KnownPillarId>(pillarId: P): CallablePillar<ContractFor<P>>;
```

- `ContractFor<P>` — a map from pillar id to its `<Pillar>Contract` type.
- `declareContracts(...)` — a consumer-side helper that registers the id→contract mapping so the SDK
  stays contract-agnostic (it must not import every pillar's contract). The mapping is ambient to the
  consumer build, not baked into the SDK.

With both in place, `pillar('finance').wishlist.list(input)` infers `input` and the `CallResult`
value from the finance contract, with no hand-written `TRouter`.

## Notes / constraints

- `KnownPillarId` is now an open `string` alias (RD-9 federation collapsed the closed compile-time
  tier — the registry is the sole source of truth for which pillars exist). So `P extends
KnownPillarId` cannot itself close the set; the constraint has to come from the keys of the
  consumer's `ContractFor` map, not from a `PILLARS` union. Design the helper around that.
- `BaseContract` / `ProcedureShape` in `@pops/pillar-sdk/capabilities` still describe a tRPC
  procedure (`_def.inputs` / `_def.output` / `_def.kind`). The lake is REST-only; the projection
  types need to be reconciled with how the manifest type generator (`manifest-type-generation`) actually emits a
  contract before this is wired, or the input/output projections will read the wrong fields.
- The two `CallResult` definitions in the SDK have diverged: the runtime client
  (`client/errors.ts`) and the capabilities projection (`capabilities/call-result.ts`) carry
  different discriminant sets. Unifying them is a prerequisite — a typed `CallablePillar` returns the
  capabilities `CallResult`, but the runtime returns the client one.

## Also deferred

- **Per-invocation `callTimeoutMs`.** Today the override is per `pillar()` client instance; a true
  per-call override needs a per-invocation options argument on each callable.
- **Integration test against a real pillar HTTP server.** Current coverage fakes the registry
  transport and `fetch`; an in-process server speaking the real OpenAPI + REST wire would close the
  full request/response loop.
