# Epic 00: Contract packages

> Theme: [Pillar finale](../README.md)

## Scope

Stand up one `@pops/contract-<pillar>` package per pillar containing types + Zod schemas only — no runtime code. Establish semver discipline + CI enforcement. Migrate consumers to depend on contracts rather than on `@pops/<pillar>-db` runtime packages.

This is the foundation for cross-pillar type safety after the registry-based discovery model lands. Severs the compile-time/runtime coupling that today's `getFinanceDrizzle()` pattern creates.

## PRDs

| #   | PRD                        | Summary                                                                                                                                                                                           | Status      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 153 | Contract package scaffold  | Per-pillar `@pops/<pillar>-contract` package shape, content boundaries, build pipeline                                                                                                            | Partial     |
| 154 | Semver enforcement CI      | CI job that diffs contract-package public surface (TS + Zod) against last git tag and blocks PRs on mismatched bumps. Includes affected-package rebuild via turbo `--filter='...[<merge-base>]'`. | Not started |
| 155 | Manifest type generation   | Generate the union `<Pillar>Contract` interface from the per-feature exports so consumers have one entry point                                                                                    | Not started |
| 156 | Consumer import discipline | Lint rule: "non-owning code may not import from `@pops/<pillar>-db`"; consumers go through `@pops/<pillar>-contract`                                                                              | Not started |
| 219 | pops-docs container        | Tiny static container serving Stoplight Elements pointed at every contract's OpenAPI spec; browseable at `/docs/`                                                                                 | Done        |

PRDs 153, 154, 155, 156 can run in parallel after 153 establishes the shape. PRD-219 is independent of the rest (only depends on PRD-153 emitting OpenAPI specs); good "filler" PRD when waiting on something else.

## Dependencies

- **Requires:** ADR-030 (contract packages decision), ADR-031 (release cadence)
- **Unlocks:** Epic 01 (SDK can be typed against contracts), Epic 05 (unified consumption SDK uses contract types), every downstream epic

## Out of Scope

- Runtime registry mechanics — separate epic
- Generated tRPC client typings — handled by Epic 05
- Renaming existing `@pops/<pillar>-db` runtime packages — they stay; contracts are additive
