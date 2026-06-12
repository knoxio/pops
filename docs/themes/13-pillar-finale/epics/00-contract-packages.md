# Epic 00: Contract packages

> Theme: [Pillar finale](../README.md)

## Scope

Stand up one `@pops/contract-<pillar>` package per pillar containing types + Zod schemas only — no runtime code. Establish semver discipline + CI enforcement. Migrate consumers to depend on contracts rather than on `@pops/<pillar>-db` runtime packages.

This is the foundation for cross-pillar type safety after the registry-based discovery model lands. Severs the compile-time/runtime coupling that today's `getFinanceDrizzle()` pattern creates.

## PRDs

| #   | PRD                        | Summary                                                                                                                   | Status      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 153 | Contract package scaffold  | Per-pillar `@pops/contract-<pillar>` package shape, content boundaries, build pipeline                                    | Not started |
| 154 | Semver enforcement CI      | A new CI job that diffs contract-package public surface area and fails the build on breaking changes without a major bump | Not started |
| 155 | Manifest type generation   | Generate the union `<Pillar>Contract` interface from the per-feature exports so consumers have one entry point            | Not started |
| 156 | Consumer import discipline | Lint rule: "non-owning code may not import from `@pops/<pillar>-db`"; consumers go through `@pops/contract-<pillar>`      | Not started |

PRDs 153-156 can run in parallel. 153 unblocks the rest by providing the package shape.

## Dependencies

- **Requires:** ADR-030 (contract packages decision), ADR-031 (release cadence)
- **Unlocks:** Epic 01 (SDK can be typed against contracts), Epic 05 (unified consumption SDK uses contract types), every downstream epic

## Out of Scope

- Runtime registry mechanics — separate epic
- Generated tRPC client typings — handled by Epic 05
- Renaming existing `@pops/<pillar>-db` runtime packages — they stay; contracts are additive
