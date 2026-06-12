# ADR-031: Release cadence by dependency tree

## Status

Proposed (Theme 13, Epic 00 + 02)

## Context

ADR-030 establishes contract packages and semver discipline. ADR-027 establishes the runtime pillar registry. Together they enable independent per-pillar release cadence: each pillar deploys when its team is ready, not in lockstep with sibling pillars.

But independent deploys raise two questions: how do consumers know what version is deployed, and how do breaking changes ripple through the dependency tree without a full-system redeploy?

This ADR captures the rules.

## Options Considered

| Option                                                          | Pros                                                                                                            | Cons                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A — Lockstep deploys (all pillars version together)**         | Trivial; no version-skew worry                                                                                  | Defeats the purpose of independent containers; one pillar's bug fix blocks all others         |
| **B — Independent deploys, no version discipline**              | Simple; teams ship when ready                                                                                   | Consumers can be silently broken by a breaking change in an upstream pillar                   |
| **C — Semver-disciplined contracts + dependency-tree adoption** | Breaking changes ripple visibly; non-breaking changes ripple silently; each consumer adopts on its own schedule | Requires CI enforcement + a "consumer migration" workflow when a major contract version ships |

## Decision

**C — Independent per-pillar deploys driven by semver-disciplined contracts (per ADR-030), with dependency-tree adoption.**

Rules:

1. **Each pillar declares the contract version it implements** in its `package.json`: `"implements": "@pops/contract-media@^1.4.0"`. The runtime registry exposes this — consumers can verify compatibility.

2. **Minor + patch releases ripple silently.** A consumer built against `@pops/contract-media@^1.3.0` continues to work when media-api deploys with `@pops/contract-media@1.5.0`, because `1.5.0` is backwards-compatible with `1.3.0` by semver rules. No consumer action needed.

3. **Major releases ripple visibly.** A `@pops/contract-media@2.0.0` release ships. media-api deploys against `^2.0.0`. Consumers built against `^1.x` now see a version mismatch in the registry. Each consumer schedules its own migration to `2.0.0` typings and redeploys when ready. The dependency tree (an automated report) shows which consumers haven't migrated yet.

4. **Runtime safety net for version skew.** If a consumer calls a pillar whose deployed major version doesn't match the consumer's pinned contract version, the `pillar()` SDK returns `{ kind: 'contract-mismatch', expected, actual }` instead of letting a malformed call land. Consumers can degrade gracefully.

5. **Breaking-change announcements** are flagged in the contract package's `CHANGELOG.md` with explicit migration notes. CI checks that any new major version has a non-empty migration section.

## Consequences

- ✅ Pillars genuinely deploy independently
- ✅ Breaking changes are visible: the dependency-tree report shows which consumers need updates
- ✅ Non-breaking changes don't require coordination: just deploy
- ✅ Runtime safety net catches version-skew at call sites instead of letting bad calls fail mysteriously
- ❌ Requires a "dependency-tree visibility" tool — a small script that walks `package.json` files + the registry and reports consumer/version pairs. Mitigation: this is easy to build (~half a day) and lives in `scripts/`.
- ❌ Major-version migrations need owner coordination — a breaking change to `@pops/contract-finance@2.0` means every finance consumer (shell, mcp, cli, cerebrum nudges, etc.) needs a migration PR. Mitigation: this should be rare; the contract surface is small.
- ❌ Mixed-version periods (some consumers on `1.x`, some on `2.x`) are normal during migration windows. The runtime registry tolerates this; the dependency-tree report visualises progress.
