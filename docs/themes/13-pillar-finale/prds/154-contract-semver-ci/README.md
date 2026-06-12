# PRD-154: Contract semver enforcement CI

> Epic: [Contract packages](../../epics/00-contract-packages.md)

## Overview

A CI workflow that diffs every `@pops/<pillar>-contract` package's public surface (TypeScript + Zod) against its last released git tag, classifies the change as patch / minor / major, and **hard-fails the PR if the declared `package.json` version doesn't match the detected change**. Backed by Microsoft's `api-extractor` for the TypeScript surface and a custom Zod schema diff for runtime contract changes. This is the enforcement that makes ADR-031's "release cadence by dependency tree" actually safe — without it, breaking changes ship silently.

## Data Model

### Per-contract artifacts (committed to git)

```
packages/<pillar>-contract/
├── api-extractor.json          # config for ts surface extraction
├── etc/
│   └── <pillar>-contract.api.md   # generated, committed; the TS public surface snapshot
└── etc/
    └── <pillar>-contract.zod.json # generated, committed; Zod _def serialisations
```

### Release tags (in the monorepo's git history)

Format: `contract-<pillar>@v<semver>`

Examples:

- `contract-finance@v0.1.0`
- `contract-finance@v1.0.0`
- `contract-media@v2.3.1`

Tags are written automatically by CI when a contract package's `package.json` `version` field changes on `main`.

### CI run metadata (transient)

Per PR check run emits a structured report:

```jsonc
{
  "contract": "@pops/finance-contract",
  "baselineTag": "contract-finance@v1.4.2",
  "currentVersion": "1.4.2", // unchanged in this PR
  "tsDiff": { "kind": "additive", "added": ["FooEntity"], "removed": [], "changed": [] },
  "zodDiff": { "kind": "additive", "added": ["FooSchema"], "removed": [], "changed": [] },
  "classification": "minor",
  "verdict": "fail",
  "reason": "minor changes detected but version was not bumped (still 1.4.2). bump to 1.5.0.",
}
```

## API Surface

### CI workflow

`.github/workflows/contract-semver.yml` — triggers:

- `pull_request` paths-filter on `packages/*-contract/**`
- `push` to `main` paths-filter on `packages/*-contract/package.json` (drives tag creation)

### Per-contract package scripts

```jsonc
{
  "scripts": {
    "extract:ts": "api-extractor run --local", // regenerates etc/<pillar>-contract.api.md
    "extract:zod": "tsx scripts/extract-zod.ts", // regenerates etc/<pillar>-contract.zod.json
    "diff:contract": "tsx scripts/diff-contract.ts", // compares current snapshots against last tag's; emits classification
  },
}
```

### Shared tooling (lives in `scripts/contract/`)

- `scripts/contract/extract-zod.ts` — walks `src/schemas/` and serialises each Zod schema's `_def` to JSON, normalised so insignificant ordering doesn't cause spurious diffs.
- `scripts/contract/diff-contract.ts` — for one contract package, fetches the last `contract-<pillar>@v*` tag, checks out its `.api.md` + `.zod.json`, compares to current, classifies, emits the JSON report.
- `scripts/contract/tag-on-bump.ts` — runs in the `push` job: detects which contract packages had their `version` field change, creates and pushes a tag for each.

### Outputs

- PR check: pass / fail per contract; summary comment with classification per contract.
- On `main`: tag creation per bumped contract.

## Business Rules

- **Every contract package CI run produces a verdict per PR.** Verdicts: `pass-no-change` / `pass-additive-noop` / `pass-bumped-correctly` / `fail-bump-required` / `fail-bump-too-small` / `fail-bump-too-large`.
- **Classification map:**
  - `tsDiff = none` AND `zodDiff = none` → **patch** required (or no bump if nothing's changing meaningfully)
  - `tsDiff = additive` OR `zodDiff = additive` (no breakages) → **minor** required
  - `tsDiff = breaking` OR `zodDiff = breaking` → **major** required
- **A "breaking" TS change** is anything api-extractor flags as removed-or-narrowed in the public API report.
- **A "breaking" Zod change** is any of: a required field added; an enum value removed; a regex tightened; an optional field made required; a union member removed; a number range narrowed.
- **`package.json` version is the only source of truth for the declared change level.** The PR doesn't use labels, body markers, or comments to declare intent.
- **The required bump is from the baseline tag's version, not the file's previous value.** Example: tag is `contract-finance@v1.4.2`; PR sets version to `1.4.2` (no bump) but adds a new entity → CI says "bump to 1.5.0 required."
- **Hard fail; no override label.** If CI detects an unmatched bump, the PR is blocked. The author either bumps the version OR reverts the change. No `breaking-change-acknowledged` escape hatch — keeps the audit log honest.
- **Major bumps require a `CHANGELOG.md` migration section.** Each contract package owns its own `CHANGELOG.md`. A PR bumping to a new major version is required to include a non-empty `### Migration from X.Y to N.0` section. CI greps for it.
- **Initial version (no baseline tag exists yet)** passes trivially. First tag is created on first merge to main of a non-zero-version contract.
- **A single PR may touch multiple contracts.** Each is classified independently; all must pass for the PR to be mergeable.
- **The `.api.md` and `.zod.json` snapshots in `etc/` must be up to date.** A drift check (regenerate, diff) runs in the same CI job. Stale snapshots fail with "run `pnpm -F @pops/<pillar>-contract extract:ts extract:zod` and commit the result."
- **Tags are created automatically on push to main**, never manually. A push that bumps the version → CI tags `contract-<pillar>@v<new-version>` and pushes it. Reduces human error.
- **Contract changes trigger a transitive dependency rebuild.** When a PR touches `packages/<pillar>-contract/**`, CI runs `pnpm turbo run typecheck test --filter='...[<merge-base>]'` to typecheck + test every workspace package that depends on the touched contract (directly or transitively). Consumer failures **block the contract PR** — a breaking change to a contract must be paired with consumer migrations (in the same PR or in a follow-up PR that merges first).
- **Affected scope is computed against the PR's merge-base**, not `main`'s tip. This handles the case where `main` advances between PR open and PR check; the diff stays anchored to the branch's actual base.
- **Affected rebuild is gated to the contract case only** for this PRD. Generalising "affected package rebuild" to _any_ workspace change is out of scope here — contracts are the load-bearing concern; other packages already have their own per-package CI matrix.

## Edge Cases

| Case                                                                                                                                              | Behaviour                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract package created in this PR (no baseline tag exists)                                                                                      | CI emits `pass-initial-version`; on merge, the first tag is created at the declared version.                                                                                                                              |
| Author bumps version but makes no actual changes                                                                                                  | CI emits `pass-no-change` and notes "version bumped but no surface diff; consider not bumping." Non-blocking.                                                                                                             |
| Author makes additive changes but declares major bump                                                                                             | CI emits `fail-bump-too-large` with "minor would suffice; consider 1.5.0 instead of 2.0.0."                                                                                                                               |
| Author makes breaking changes but bumps only minor                                                                                                | CI emits `fail-bump-too-small` with specific line-level breakage report from api-extractor + Zod diff.                                                                                                                    |
| Major bump but no `CHANGELOG.md` migration section                                                                                                | CI emits `fail-migration-section-missing` with link to the changelog template.                                                                                                                                            |
| `.api.md` snapshot is stale (not regenerated after a source change)                                                                               | CI emits `fail-snapshot-stale` with instructions to regenerate.                                                                                                                                                           |
| Zod schema's `_def` serialisation differs only in metadata (e.g. error message)                                                                   | Diff script ignores `errorMap` and `description` fields; only structural changes count.                                                                                                                                   |
| PR touches multiple contracts, some pass and some fail                                                                                            | All-or-nothing: every contract must pass or PR is blocked. CI emits one summary comment listing per-contract verdicts.                                                                                                    |
| Tag creation race: two PRs to main land within seconds, both bumping the same contract                                                            | Tag operation is idempotent; the second push's `git tag` fails non-fatally; check `git ls-remote` first to skip if tag exists. CI prints a warning but doesn't fail.                                                      |
| Contract package is deleted in a PR                                                                                                               | Deletion is treated as a major break. PR fails unless the package version is bumped to `99.0.0-deprecated` or the deletion is explicitly noted in `CHANGELOG.md` under `## Removed`.                                      |
| Zod schema changes are _structurally_ equivalent but use a different combinator (e.g. `z.union([A, B])` → `z.discriminatedUnion('kind', [A, B])`) | Treated as breaking by default (the runtime parser changes). Author can verify equivalence and confirm with the bump.                                                                                                     |
| Author force-pushes between CI runs and removes a breaking change                                                                                 | CI re-runs from scratch; verdict reflects the latest commit. No state carried between runs.                                                                                                                               |
| Contract change affects 30+ workspace packages                                                                                                    | Turbo runs them in parallel; CI matrix shape is unchanged (turbo handles concurrency). Total wall-clock scales with the slowest dependent, not with the count.                                                            |
| Contract change is purely additive (minor) but a consumer's test depends on the _absence_ of the new field                                        | Consumer's test fails. The contract PR is blocked. Author either updates the consumer in the same PR or fixes the test. (This is a rare case but correct behaviour — consumer tests should not rely on type-system gaps.) |
| `--filter='...[<merge-base>]'` returns zero affected packages (no consumers)                                                                      | CI emits `pass-no-consumers` and skips the rebuild step. The contract still goes through the semver diff check.                                                                                                           |
| Turbo's dep graph is stale (e.g. a new `package.json` dep was added but the lockfile wasn't regenerated)                                          | Pre-step runs `pnpm install --frozen-lockfile`; if the lockfile is out of date, CI fails early with a clear message. Turbo dep graph regenerates from the current lockfile state.                                         |

## User Stories

| #   | Story                                                                   | Summary                                                                                                                                                                                                                                       | Parallelisable                                                                  |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 01  | [us-01-api-extractor-config](us-01-api-extractor-config.md)             | Set up `api-extractor.json` + `.api.md` snapshot generation for the finance contract as the pilot                                                                                                                                             | blocked by PRD-153 us-01                                                        |
| 02  | [us-02-zod-extractor](us-02-zod-extractor.md)                           | `scripts/contract/extract-zod.ts` — walks schemas, serialises `_def`, emits `etc/<pillar>-contract.zod.json`                                                                                                                                  | blocked by PRD-153 us-02                                                        |
| 03  | [us-03-diff-script](us-03-diff-script.md)                               | `scripts/contract/diff-contract.ts` — fetches baseline tag, runs both diffs, classifies, emits verdict                                                                                                                                        | blocked by us-01 + us-02                                                        |
| 04  | [us-04-ci-workflow](us-04-ci-workflow.md)                               | `.github/workflows/contract-semver.yml` — runs diff per touched contract; per-PR summary comment                                                                                                                                              | blocked by us-03                                                                |
| 05  | [us-05-tag-on-bump](us-05-tag-on-bump.md)                               | `scripts/contract/tag-on-bump.ts` — push-to-main job that creates per-contract tags when version bumps                                                                                                                                        | blocked by us-03                                                                |
| 06  | [us-06-changelog-enforcement](us-06-changelog-enforcement.md)           | CI grep for `### Migration from` section on major bumps; blocks PR if missing                                                                                                                                                                 | blocked by us-04                                                                |
| 07  | [us-07-self-test](us-07-self-test.md)                                   | Synthetic mismatch test: inject a fake breaking change in a fixture contract, verify CI catches it. Mirrors PRD-2917's self-test pattern.                                                                                                     | blocked by us-04                                                                |
| 08  | [us-08-finance-contract-baseline](us-08-finance-contract-baseline.md)   | Generate the first `etc/finance-contract.api.md` + `.zod.json` snapshots; create `contract-finance@v0.1.0` tag                                                                                                                                | blocked by us-01 + us-02; gated on PRD-153 us-07 (finance content) being merged |
| 09  | [us-09-rollout-to-other-contracts](us-09-rollout-to-other-contracts.md) | Once finance is green, apply the same scaffolding to media, inventory, cerebrum, core (as those contracts are added by their respective PRDs)                                                                                                 | blocked by us-08; runs as a follow-up sweep                                     |
| 10  | [us-10-affected-package-rebuild](us-10-affected-package-rebuild.md)     | When a contract package changes in a PR, every transitively-dependent workspace package's typecheck + test runs in the same CI run via `pnpm turbo run typecheck test --filter='...[<merge-base>]'`. Consumer failures BLOCK the contract PR. | blocked by us-04                                                                |

## Out of Scope

- OpenAPI diff (`oasdiff` or similar) — deferred. CI checks TS + Zod only. OpenAPI emission stale-check IS run (drift between source and committed `.openapi.json`), but breaking-change classification on OpenAPI itself is out of scope for this PRD.
- Cross-contract dependency analysis (e.g. "if contract-media bumps, what contracts that depend on it need to consider migrating?") — that's PRD-159's dependency-tree visualisation territory, in Epic 02.
- Auto-bumping the version in a PR. The author bumps explicitly; CI verifies.
- Soft-fail mode or override labels. By design — see business rules.
- npm publish of contract packages. Workspace-only per ADR-030. The git tags are the version-of-record, not npm.
- Breaking-change communication beyond CI (e.g. Slack notifications, dependency-version graph reports) — those land in Epic 02 (PRD-163 subscription model) once the runtime registry exists.
- Bumping versions automatically on merge (release-please / changeset) — deferred until we see if the manual flow is painful. Authors bump in the PR; CI tags on merge.
