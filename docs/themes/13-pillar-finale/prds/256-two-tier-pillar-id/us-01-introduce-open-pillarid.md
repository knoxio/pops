# US-01: Introduce the open `PillarId` type

> PRD: [PRD-256 — Two-tier pillar id](README.md)

## Description

As the pillar SDK, I want an open `PillarId = string` type alongside the closed `KnownPillarId` union,
with the two-tier rule documented, so that runtime/registry surfaces can carry pillar ids the build has
never heard of while in-repo call sites keep their compile-time typo safety.

## Acceptance Criteria

- [x] `@pops/pillar-sdk` exports `type PillarId = string` (a documented alias) alongside the existing `KnownPillarId`; JSDoc states which tier each is for.
- [x] `KnownPillarId`, `PILLARS`, and `isKnownPillarId(id: string): id is KnownPillarId` are unchanged in shape and still exported.
- [x] The capability projection from [PRD-160](../160-capability-projection-types/README.md) is unchanged: `pillar<P extends KnownPillarId>()` still rejects an unknown literal at compile time. The open path for unknown ids is the explicit string/`callDynamic` overload ([PRD-242](../242-dynamic-approuter/README.md)), not an accidental widening of the typed projection.
- [x] A short doc (SDK README section or `capabilities/` module doc) records the rule: closed union on `PILLAR_UPSTREAMS` + `MODULE_PARENT_PILLAR` + typed `pillar()`; open `PillarId` on registry/routing/nav.
- [x] No `as any`, `as unknown as`, or `eslint-disable` is introduced. Narrowing `PillarId → KnownPillarId` is only ever via `isKnownPillarId`.
- [x] `pnpm typecheck` green repo-wide.

## Notes

`PillarId` is intentionally a plain `string` alias, not a brand — runtime ids are genuinely open and a
brand would force casts at every registry boundary (the opposite of the goal). The discipline is which
_surface_ uses which alias, enforced in US-02/US-03 + review. This reconciles the tension with PRD-160:
that PRD's closed union earns its keep for in-repo ergonomics and stays; this PRD adds a parallel open
type for the runtime world, it does not regenerate or delete the union.
