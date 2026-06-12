# ADR-030: Contract packages and semver discipline

## Status

Proposed (Theme 13, Epic 00)

## Context

Theme 12 split data per pillar but cross-pillar type sharing still happens via direct workspace imports of `@pops/<pillar>-db` packages. This couples compile-time (the consumer imports finance-db) with runtime (finance-db includes drizzle, services, migrations). It also forces every consumer to redeploy when a pillar's internal package changes, even if no public surface changed.

For Theme 13's goal of independent per-pillar release cadence with full type safety across HTTP, the type-sharing layer needs to be separated from the runtime layer.

## Options Considered

| Option                                                                 | Pros                                                                                        | Cons                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A — Consumers keep importing `@pops/<pillar>-db`**                   | No new packages                                                                             | Type changes require coordinating consumer redeploys; couples runtime to compile-time           |
| **B — Separate `@pops/contract-<pillar>` packages (types + Zod only)** | Clean separation; consumers depend only on stable type surface; independent release cadence | One more package per pillar to maintain; need discipline about what's "contract" vs. "internal" |
| **C — Generate TypeScript types from tRPC routers at build time**      | No new package source; types follow router automatically                                    | Consumers can't pin a version; runtime-vs-typing drift becomes invisible until calls fail       |
| **D — OpenAPI / GraphQL schema as the contract**                       | Standard format; tooling exists                                                             | Loses tRPC's ergonomics; bigger refactor; less idiomatic in this codebase                       |

## Decision

**B — Separate `@pops/contract-<pillar>` packages containing types + Zod schemas only.**

Each pillar publishes one contract package. It contains: entity types, procedure input/output schemas, error discriminants, URI handler advertisements, search adapter advertisements, AI tool advertisements, settings key declarations, manifest snapshot types. No runtime code, no drizzle, no Express, no anything that would force a consumer to rebuild when an implementation detail changes.

Semver discipline:

- **Patch** = internal fix, no observable surface change
- **Minor** = additive (new procedure, new optional field)
- **Major** = breaking (renamed field, removed procedure, changed error discriminant)

Enforced via a CI job that diffs the public surface area of each contract package against `main` and fails the build if a breaking change ships without a major version bump.

Lint rule: non-owning code may not import from `@pops/<pillar>-db`. Consumers go through `@pops/contract-<pillar>` only.

## Consequences

- ✅ Pillars can refactor internals freely without breaking consumers
- ✅ Type safety is preserved across HTTP — the consumer's compiler sees the same types the pillar advertises
- ✅ Breaking changes become visible via the dependency-version graph
- ✅ The contract is small and auditable — easy to review changes
- ❌ One more package per pillar to maintain
- ❌ Discipline required to keep "contract" vs. "internal" boundaries clear — easy to leak implementation types into the contract by accident
- ❌ Semver compliance requires consistent review — mitigation: CI catches semver violations mechanically
- ❌ Initial migration cost: every existing import of `@pops/<pillar>-db` from non-owning code needs to be retargeted. Mitigation: lint rule catches new violations; existing ones get retargeted as part of Epic 00 PRDs.
