# Contract semver classification + enforcement

Status: not built. The drift half shipped (see [Contract drift CI](../themes/federation/prds/contract-semver-ci.md)). This is the unbuilt semantic-version half.

## Idea

Diff every pillar's public wire surface (TypeScript types + Zod schemas) against a baseline, classify the change as patch / minor / major, and **hard-fail a PR whose declared version doesn't match the detected change level**. The drift gate guarantees the committed artifacts match the source; this would additionally guarantee the _version number_ honestly reflects whether the change is breaking — so a consumer can pin a version and trust it.

None of the following exists in the repo today. Pillar `package.json` `version` fields all sit at `0.1.0` and are not consumed by any CI logic.

## What it would add

- **Surface snapshots per pillar**, committed:
  - a TS public-API report (e.g. via `api-extractor`) — the public type surface.
  - a normalised Zod `_def` serialisation — the runtime schema surface, normalised so insignificant ordering / metadata (`errorMap`, `description`) doesn't cause spurious diffs.
- **A baseline**: the last released `contract-<pillar>@v<semver>` git tag (none of these tags exist today).
- **A diff + classifier**: fetch the baseline snapshots, diff against current, classify:
  - no surface change → patch (or no bump).
  - additive only (new field/optional/procedure) → minor.
  - breaking (required field added, enum value removed, regex tightened, optional→required, union member removed, number range narrowed, removed/narrowed TS export) → major.
- **A verdict per pillar per PR**: `pass-no-change` / `pass-additive-noop` / `pass-bumped-correctly` / `pass-initial-version` / `fail-bump-required` / `fail-bump-too-small` / `fail-bump-too-large` / `fail-migration-section-missing`. The `package.json` `version` is the only source of truth for declared intent — no labels, no body markers, no override escape hatch.
- **Required bump computed from the baseline tag's version**, not the file's previous value.
- **Major bumps require a `CHANGELOG.md` migration section** (`### Migration from X.Y to N.0`), grepped by CI. No pillar carries a `CHANGELOG.md` today.
- **Auto-tagging on merge to main**: a push that bumps a version creates and pushes `contract-<pillar>@v<new-version>` idempotently. No manual tagging.
- **A self-test fixture**: inject a synthetic breaking change and assert CI catches it.

## Why it's deferred

- The drift gate already prevents the silent-stale-artifact failure mode, which is the load-bearing concern. Semver enforcement is a layer on top.
- It presupposes a release/versioning discipline (per-contract tags, changelogs, baseline snapshots) that the repo never adopted — versions are pinned at `0.1.0` and pillars deploy as Docker images off `build-*` tags, not contract semver tags.
- The original spec assumed npm-style versioned packages and turbo `--filter='...[<merge-base>]'` affected rebuild. The repo dropped turbo and `packages/*`; the affected-rebuild idea shipped in a different, generalised form (disk-discovered units + merge-base diff in `_discover-units.yml`), and contracts live in-pillar, not as standalone versioned packages. A semver layer would need re-grounding on the actual federation model first.

## Out of scope even for the idea

- OpenAPI breaking-change classification (`oasdiff`) — the OpenAPI drift check already exists; classifying breaking changes _on the OpenAPI document itself_ is a separate effort.
- Cross-contract dependency-tree visualisation ("if media bumps, who must migrate?").
- Auto-bumping versions in a PR (release-please / changesets). Author bumps; CI would only verify.
- Breaking-change notifications beyond CI (Slack, dependency graphs).
