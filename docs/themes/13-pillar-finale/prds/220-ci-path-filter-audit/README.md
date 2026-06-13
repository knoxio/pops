# PRD-220: ci-path-filter-audit

> Epic: [CI leanness](../../epics/12-ci-leanness.md)

## Overview

Every workflow under `.github/workflows/` must have a `paths:` filter on both the `pull_request:` and `push: branches: [main]` triggers scoped tightly to the file dependency surface that workflow actually reads. Today many per-pillar quality workflows fire on every non-docs PR via a broad `paths-ignore: docs/**` trigger and then short-circuit work at the job level. The runner still spins up; the required-check still pretends to be "running". Tightening the trigger-level filter drops the workflow from the required-checks list entirely on irrelevant PRs, which is what gets a docs-only PR down to ≤ 4 required checks.

This is the first PRD in the CI leanness track. Path-filter audit only — no affected-rebuild orchestrator (that's PRD-221), no docs fast-path (PRD-222).

## Data Model

No data. YAML-only changes under `.github/workflows/`.

## API Surface

### Trigger shape (every workflow)

```yaml
on:
  pull_request:
    paths:
      - '<surface 1>/**'
      - '<surface 2>/**'
      - '.github/workflows/<this-workflow>.yml'
      # for reusable callers, also:
      - '.github/workflows/_pkg-check.yml'
  push:
    branches: [main]
    paths:
      # mirror the pull_request paths exactly
```

### Carve-out

`quality.yml` keeps its broad `paths-ignore: ["docs/**", "**/*.md"]` because it owns workspace-wide lint / format / module-boundaries — every code change can break it. Documented inline in the workflow file as a deliberate exception.

### Per-workflow filter rules

| Workflow                      | PR trigger surface                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-quality.yml`              | `packages/app-ai/**`, `packages/ui/**`, `packages/db-types/**`, `packages/api-client/**`, `packages/types/**`                                                                                                                                                        |
| `api-client-quality.yml`      | `packages/api-client/**`, `packages/db-types/**`                                                                                                                                                                                                                     |
| `api-quality.yml`             | `apps/pops-api/**`, every `packages/*-db/**`, `packages/types/**`, `packages/finance-contract/**`, `packages/pillar-sdk/**`                                                                                                                                          |
| `api-test.yml`                | same surface as `api-quality.yml` plus `packages/auth/**`                                                                                                                                                                                                            |
| `cerebrum-api-quality.yml`    | `apps/pops-cerebrum-api/**`, `packages/cerebrum-db/**`, `packages/cerebrum-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                            |
| `cerebrum-db-quality.yml`     | `packages/cerebrum-db/**`, `packages/db-types/**`                                                                                                                                                                                                                    |
| `core-api-quality.yml`        | `apps/pops-core-api/**`, `packages/core-db/**`, `packages/core-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                                        |
| `core-quality.yml`            | `packages/core-db/**`, `packages/db-types/**`                                                                                                                                                                                                                        |
| `db-types-quality.yml`        | `packages/db-types/**`                                                                                                                                                                                                                                               |
| `fe-quality.yml`              | mirror of existing `push.paths` (apps/pops-shell + the app-\* + pillar-sdk + ui + api-client + widgets + navigation + types + relevant db chunks)                                                                                                                    |
| `fe-test-e2e.yml`             | tighten to `apps/pops-shell/**`, `apps/pops-api/**`, `apps/pops-*-api/**`, `packages/app-*/**`, `packages/ui/**`, `packages/api-client/**`, `packages/pillar-sdk/**`, `packages/widgets/**`, `packages/navigation/**`, `packages/types/**`, `packages/*-contract/**` |
| `finance-api-quality.yml`     | `apps/pops-finance-api/**`, `packages/finance-db/**`, `packages/finance-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                               |
| `finance-db-quality.yml`      | `packages/finance-db/**`, `packages/finance-contract/**`, `packages/db-types/**`                                                                                                                                                                                     |
| `finance-quality.yml`         | `packages/app-finance/**`, `packages/finance-contract/**`, `packages/ui/**`, `packages/db-types/**`, `packages/api-client/**`, `packages/pillar-sdk/**`                                                                                                              |
| `food-api-quality.yml`        | `apps/pops-food-api/**`, `packages/food-db/**`, `packages/food-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                                        |
| `food-db-quality.yml`         | `packages/food-db/**`, `packages/db-types/**`, the migration baseline drop SQL                                                                                                                                                                                       |
| `food-quality.yml`            | `packages/app-food/**`, `packages/food-contract/**`, `packages/ui/**`, `packages/db-types/**`, `packages/api-client/**`, `packages/pillar-sdk/**`                                                                                                                    |
| `inventory-api-quality.yml`   | `apps/pops-inventory-api/**`, `packages/inventory-db/**`, `packages/inventory-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                         |
| `inventory-db-quality.yml`    | `packages/inventory-db/**`, `packages/db-types/**`                                                                                                                                                                                                                   |
| `inventory-quality.yml`       | `packages/app-inventory/**`, `packages/inventory-contract/**`, `packages/ui/**`, `packages/db-types/**`, `packages/api-client/**`, `packages/pillar-sdk/**`                                                                                                          |
| `lists-api-quality.yml`       | `apps/pops-lists-api/**`, `packages/lists-db/**`, `packages/lists-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                                     |
| `lists-db-quality.yml`        | `packages/lists-db/**`, `packages/db-types/**`, the migration baseline drop SQL                                                                                                                                                                                      |
| `media-api-quality.yml`       | `apps/pops-media-api/**`, `packages/media-db/**`, `packages/media-contract/**`, `packages/db-types/**`, `packages/pillar-sdk/**`                                                                                                                                     |
| `media-db-quality.yml`        | `packages/media-db/**`, `packages/db-types/**`                                                                                                                                                                                                                       |
| `media-quality.yml`           | `packages/app-media/**`, `packages/media-contract/**`, `packages/ui/**`, `packages/db-types/**`, `packages/api-client/**`, `packages/pillar-sdk/**`                                                                                                                  |
| `module-registry-quality.yml` | `packages/module-registry/**`, `packages/types/**`                                                                                                                                                                                                                   |
| `navigation-quality.yml`      | `packages/navigation/**`, `packages/db-types/**`, `packages/types/**`                                                                                                                                                                                                |
| `pillar-images.yml`           | already tight (per-pillar matrix). Leave.                                                                                                                                                                                                                            |
| `pillar-schema-coverage.yml`  | already tight. Leave.                                                                                                                                                                                                                                                |
| `quality.yml`                 | **carve-out** — broad `paths-ignore` stays. Documented inline.                                                                                                                                                                                                       |
| `contract-semver.yml`         | already tight. Leave.                                                                                                                                                                                                                                                |
| `docker-build.yml`            | already tight. Leave.                                                                                                                                                                                                                                                |
| `infra-lint.yml`              | already tight. Leave.                                                                                                                                                                                                                                                |
| `storybook-quality.yml`       | `apps/pops-storybook/**`, `packages/app-*/package.json`                                                                                                                                                                                                              |
| `ui-quality.yml`              | `packages/ui/**`                                                                                                                                                                                                                                                     |
| `worker-food-image.yml`       | already tight. Leave.                                                                                                                                                                                                                                                |
| `workflows-quality.yml`       | `.github/workflows/**`                                                                                                                                                                                                                                               |
| `publish-images.yml`          | main-push-only; no PR trigger. Leave.                                                                                                                                                                                                                                |
| `release.yml`                 | main-push-only; no PR trigger. Leave.                                                                                                                                                                                                                                |
| `_pkg-check.yml`              | reusable callable; no triggers. Leave.                                                                                                                                                                                                                               |

## Business Rules

- The `pull_request:` trigger filter must mirror the `push: branches: [main]` filter for any given workflow. Divergence is a smell — a workflow that fires on main pushes for surface X should fire on PRs touching surface X, and vice versa.
- Every workflow's path list must include the workflow file itself (so editing the workflow re-runs it) and, for reusable callers, `.github/workflows/_pkg-check.yml`.
- `quality.yml` is the only PR-triggered workflow that may keep a broad `paths-ignore`-style filter. Every other workflow uses an allowlist `paths:` filter.
- Job-level `dorny/paths-filter` gates already present in every workflow are left in place — they remain useful on `main` pushes where the trigger-level filter may match a larger surface than any single job needs.
- Workflows that only run on `main` (`publish-images.yml`, `release.yml`) have no PR trigger and are not in scope.
- Reusable workflows (`_pkg-check.yml`) have no triggers and are not in scope.
- The `paths-ignore: docs/**, **/*.md` clause that today appears on most quality workflows is removed when the workflow gains an explicit allowlist — an allowlist is already strictly more selective.

## Acceptance Criteria

- [x] Every `*-quality.yml` workflow under `.github/workflows/` (except `quality.yml`) uses an allowlist `paths:` filter on both `pull_request:` and `push: branches: [main]`. No `paths-ignore` on those triggers.
- [x] `quality.yml` keeps its broad `paths-ignore` filter and carries an inline comment explaining the carve-out and referencing PRD-220.
- [x] `fe-test-e2e.yml`'s PR trigger drops `packages/auth/**`, `packages/test-utils/**`, `packages/module-registry/**`, `packages/food-contracts/**`, and `packages/*-db/**` (the E2E suite reaches DB packages transitively via the api / app-\*; direct DB-package changes that don't touch a contract or an api don't change rendered UI behaviour).
- [x] `api-test.yml`'s PR trigger mirrors its `push:` paths exactly — no `paths-ignore`.
- [x] `workflows-quality.yml`'s PR trigger narrows to `.github/workflows/**`.
- [x] Each per-pillar api-quality workflow includes its pillar's `*-contract` package and `packages/pillar-sdk/**` (a contract or SDK change can plausibly break the api).
- [x] Every workflow YAML still parses (validated via `yamllint` or `actionlint`).
- [x] `pnpm format:check` and `pnpm typecheck` pass at the repo root.

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                                    |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow is a required branch-protection check on a PR whose paths don't match it | GitHub rulesets with `strict_required_status_checks_policy: false` treat a never-triggered workflow as non-blocking. PR is mergeable.        |
| PR adds a new file under a surface not covered by any workflow filter             | The workspace-wide `quality.yml` still runs (it has the carve-out). Coverage gap is surfaced at code review.                                 |
| Pillar A's contract changes; pillar A's api workflow needs to fire                | Filter includes `packages/<pillar>-contract/**`. Fires as intended.                                                                          |
| Editing a workflow's own YAML file                                                | Filter includes the workflow file path. Fires as intended.                                                                                   |
| PR touches the reusable `_pkg-check.yml`                                          | Every workflow that uses it has it in its filter — all dependent workflows fire.                                                             |
| `pnpm-lock.yaml` change                                                           | Not added to the per-pillar quality filters (overscoped). `docker-build.yml`, `pillar-images.yml`, `worker-food-image.yml` already cover it. |
| A future pillar is added                                                          | A new `<pillar>-api-quality.yml` is created; it follows the same shape. No edits to other workflows required.                                |

## User Stories

| #   | Story                                                       | Summary                                                                     | Parallelisable    |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| 01  | [us-01-narrow-pr-triggers](us-01-narrow-pr-triggers.md)     | Mirror `push.paths` into `pull_request.paths` across every `*-quality.yml`  | yes — independent |
| 02  | [us-02-tighten-fe-e2e](us-02-tighten-fe-e2e.md)             | Tighten `fe-test-e2e.yml`'s PR trigger to the FE-runtime surface only       | yes — independent |
| 03  | [us-03-carve-out-quality](us-03-carve-out-quality.md)       | Confirm `quality.yml` keeps the broad filter; document the carve-out inline | yes — independent |
| 04  | [us-04-add-pillar-sdk-paths](us-04-add-pillar-sdk-paths.md) | Add `packages/pillar-sdk/**` + per-pillar contract paths to api/fe filters  | blocked by us-01  |

## Out of Scope

- **PRD-221 — affected-rebuild orchestrator.** No turbo `--filter='...[origin/main]'` job here. No matrix-of-changed-pillars yet.
- **PRD-222 — docs-only fast-path workflow.** Today docs-only PRs are handled implicitly by the `paths-ignore`-on-`quality.yml` plus per-workflow path filters; the dedicated fast-path workflow lands in PRD-222.
- **PRD-226 — budget enforcement.** No CI check that fails the PR if a workflow exceeds its time budget.
- Changes to `quality.yml`'s lint / format / module-boundary rules. The lint rules themselves are untouched; only the trigger shape is reviewed.
- Changes to `publish-images.yml`, `release.yml`, `pillar-images.yml`, `worker-food-image.yml`, `contract-semver.yml`, `docker-build.yml`, `infra-lint.yml`, `pillar-schema-coverage.yml` — they're already tight or main-only.
