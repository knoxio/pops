# PRD: CI/CD Pipelines

> Epic: [CI/CD Pipelines](../../epics/cicd-pipelines.md)
> Status: Done

## Overview

GitHub Actions workflows for the pops repo. Quality gates run on every PR and on push to `main`; image publishing runs on push to `main` and `v*` tags (the images themselves are specified by the [Application Packaging & GHCR Contract](../application-packaging/README.md) PRD). The repo is a federation of independent REST pillars under `pillars/*` plus shared libraries under `libs/*`; there is no `apps/` monolith, no `pops-api`, no `packages/*`. CI must therefore gate a **disk-discovered** set of units (TS pillars, TS libs, the Rust `contacts` pillar, and the seven `pillars/*/app` frontends) without a hand-maintained list, and collapse the resulting dynamic matrix down to **one statically-named required check** that the branch ruleset can require.

**No deployment workflow.** Server-side rollout is handled out-of-band by Watchtower on the deploy host pulling new GHCR digests (spec lives in `knoxio/homelab-infra` PRD-095). pops CI never SSHes to a server, never runs ansible, and never uses a self-hosted runner.

## The required-check problem and the CI Gate

The branch ruleset can only require checks by their **static context name**. Most of the load-bearing jobs (typecheck/test/build/clippy per unit) carry **dynamic matrix names** (`finance (pillar) — ts`, `@pops/app-food`, `contacts (pillar) — rust`, …) that change as units are added, so they cannot be listed in the ruleset individually. They live across six separate workflows, each with its own path filters, so a single `needs:`-chained umbrella workflow would either double-run every job or rename the existing required contexts.

`ci-gate.yml` solves this with a `workflow_run` aggregator. It **observes** the six gated workflows' conclusions at the same head SHA via the Actions API (zero extra CI cost, re-runs nothing) and reports a single `CI Gate` context. The ruleset requires that one context, which transitively makes every gated job load-bearing.

| Gated workflow (observed by CI Gate) | What it gates                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `Quality`                            | Lint, format, module boundaries, duplication, scripts tests                                            |
| `Unit Quality`                       | Per-unit fmt/lint/build/typecheck/codegen-drift/test for every `pillars/*` + `libs/*` unit (TS + Rust) |
| `App Quality`                        | Each `pillars/*/app` frontend's own typecheck + test                                                   |
| `FE Quality`                         | Shell typecheck + test + build (compiles every app transitively)                                       |
| `Rust Quality`                       | Whole cargo workspace fmt/clippy/build/test + OpenAPI drift                                            |
| `Registry Generated Quality`         | `libs/module-registry` `generated.ts` drift                                                            |

Convergence rules baked into the gate:

- A failure is **sticky** — the failed run stays at the SHA, so any later re-evaluation (triggered by a slower sibling finishing) still sees it and reports red.
- A sibling still in flight is **not** a failure — the last sibling to complete re-triggers the gate and produces the authoritative verdict.
- A path-filtered-out sibling is **absent** from the API result and treated as non-failing (skipped ≠ failure), so docs-only PRs are not blocked.

## Workflows

### Required (named in the branch ruleset)

| Workflow / job                      | Trigger                                   | Steps                                                                   |
| ----------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `quality.yml` → `Lint`              | PR / push (code paths)                    | `pnpm lint` (oxlint `--type-aware`)                                     |
| `quality.yml` → `Format`            | PR / push (code paths)                    | `pnpm format:check` (oxfmt)                                             |
| `quality.yml` → `Module boundaries` | PR / push (code paths)                    | `pnpm lint:boundaries` (dependency-cruiser over `pillars libs scripts`) |
| `quality.yml` → `Duplication check` | PR / push (code paths)                    | `jscpd --threshold 5` over authored TS/TSX                              |
| `ci-gate.yml` → `CI Gate`           | `workflow_run` of the six gated workflows | Aggregate their conclusions at the head SHA                             |
| `agent-review.yml` → `agent-review` | Non-draft PR                              | Two blocking federation isolation guards + advisory LLM review          |

### Disk-discovered quality matrices

| Workflow                         | Trigger                                                                              | Behaviour                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_discover-units.yml` (reusable) | `workflow_call`                                                                      | Scans `pillars/*` + `libs/*` (maxdepth 1) for a manifest (`package.json` → TS, `Cargo.toml [package]` → Rust); emits the full unit list + the changed subset; `assert-app-coverage` job fails if any `pillars/*/app` is not routed to both App Quality and FE Quality                                              |
| `unit-quality.yml`               | PR / push (unit + shared-root paths)                                                 | Matrix over the changed units. TS lane: install subgraph, oxfmt check, oxlint, build dep closure, build own unit (only if it owns a `build` task), typecheck, codegen drift (`generate:*` then `git diff --exit-code`), test. Rust lane: `cargo fmt --check`, `clippy -D warnings`, build, test — all `-p <crate>` |
| `app-quality.yml`                | PR / push (`pillars/*/app/**`, FE libs)                                              | Disk-discovered matrix over the seven `@pops/app-*` frontends; builds dep closure (`^...`), typecheck, then `test:coverage` (or `test`). App units have no own `build` (they build via the shell), so no build step on the unit                                                                                    |
| `fe-quality.yml`                 | PR / push (`pillars/shell/**`, `pillars/*/app/**`, `pillars/*/openapi/**`, FE libs)  | Shell-only: build shared deps, typecheck, nginx fallback-conf drift gate, test, build the SPA (compiles every `@pops/app-*` transitively)                                                                                                                                                                          |
| `rust-quality.yml`               | PR / push (Cargo, `deny.toml`, `pillars/contacts/**`, `libs/pops-*`, extractability) | Whole cargo workspace: `fmt --check`, `clippy -D warnings`, cargo-deny + crate-boundary guard, build, test, and `contacts` OpenAPI 3.0 emission drift gate                                                                                                                                                         |
| `registry-generated-quality.yml` | PR / push (`libs/module-registry/**`, `libs/types/**`)                               | Regenerate `libs/module-registry/src/generated.ts` (`mise run build` then `mise run registry`) and fail on diff                                                                                                                                                                                                    |

### Docker, schema, and infra gates

| Workflow                            | Trigger                                       | Behaviour                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-build.yml`                  | PR / push (Dockerfiles, compose, lockfile)    | Builds the **builder stage** of every `pillars/*/Dockerfile` (disk-discovered) plus shell + mcp; validates `infra/docker-compose.yml` and `infra/docker-compose.dev.yml` via `config --quiet` (stubbing referenced secret files first) |
| `pillar-quality.yml` (Pillar Image) | **Push to main only** (not PR)                | Disk-discovered matrix building the **full** image of every `pillars/*/Dockerfile` (`push: false`) — the one full-image build nothing else does automatically on `main`                                                                |
| `pillar-schema-coverage.yml`        | PR / push (`pillars/*/src/db/**`, migrations) | Per-pillar: build the pillar, apply its migrations journal against a fresh SQLite DB, assert every schema table is covered; includes a self-test that injects a fake table and asserts the guard catches it                            |
| `infra-lint.yml`                    | PR / push (`infra/litestream/**`)             | `yaml-lint` over Litestream configs                                                                                                                                                                                                    |
| `workflows-quality.yml`             | PR / push (`.github/workflows/**`)            | `yaml-lint` over `.github/workflows/*.yml`                                                                                                                                                                                             |

### Publishing, release, and watchdog

| Workflow                    | Trigger                                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish-images.yml`        | Push to main, `v*` tags, `workflow_dispatch` (`only` input) | Build + push the full fleet to `ghcr.io/knoxio/pops-*`. Frontend/tooling images (shell, mcp, orchestrator, docs) from a fixed matrix; pillar images **disk-discovered** from the prod compose's `image: ghcr.io/knoxio/pops-<x>:` refs that also have a `pillars/<x>/Dockerfile`. Image contract is the [Application Packaging & GHCR Contract](../application-packaging/README.md) PRD |
| `release.yml`               | `workflow_dispatch` only                                    | Compute semver from history, tag `vX.Y.Z`, create the GitHub Release. Tag-only by design (ruleset forbids direct pushes to `main`)                                                                                                                                                                                                                                                      |
| `format-drift-watchdog.yml` | `cron` every 6h + `workflow_dispatch`                       | Whole-tree `pnpm format:check` on `main`; opens/updates/closes a single tracking issue when oxfmt drift accumulates (lint-staged only formats staged files, so untouched files can drift silently)                                                                                                                                                                                      |

### Non-required additive gates (report, do not block)

These live inside the gated workflows but are explicitly **kept out** of the required-checks ruleset during the federation isolation phase. They surface regressions as signal without blocking merges; promote to required once the tree is clean.

| Gate                                          | Workflow                              | Asserts                                                                          |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| Scripts tests                                 | `quality.yml`                         | Root-owned `scripts/**/*.test.ts` CI guards run (invisible to the unit matrices) |
| Exports discipline                            | `quality.yml`                         | Every unit's `exports`/`main`/`types` targets exist and fall under `files`       |
| Extractability — declared deps (EX-1)         | `quality.yml`                         | No phantom (undeclared) dependencies in changed units                            |
| Extractability — baseline monotonicity (EX-3) | `quality.yml`                         | The dependency-cruiser violation baseline never grows                            |
| Bundle-map coverage (RD-10)                   | `quality.yml`                         | Every `pillars/*/app` is referenced by the shell's static `bundle-map.tsx`       |
| Vendored contract drift (ADR-033)             | `quality.yml`                         | A consumer's vendored OpenAPI snapshot is byte-identical to its canonical source |
| Crate boundaries + supply chain               | `rust-quality.yml`                    | cargo-deny licence/advisory policy; no lib→pillar or pillar→pillar crate deps    |
| EX-2 full sandbox                             | nightly (out of this repo's PR lanes) | Each unit installs + builds in isolation                                         |

## Business Rules

- **Path filters on every workflow.** API changes don't trigger FE CI, and vice versa. Docs-only PRs (`docs/**`, `**/*.md`) are excluded from `quality.yml` entirely, keeping them to ≤ 4 required checks (the path-filtered siblings never run, so `CI Gate` never reports → non-blocking).
- **All workflows run on `ubuntu-latest`.** pops CI never depends on the home lab and never uses a self-hosted runner.
- **Discovery is from disk, never a hand-list.** Adding or removing a pillar, lib, or app needs no workflow edit. The unit display `name` (dir basename) is a path/display key ONLY — selectors always use the manifest `pkg` name (`@pops/pillar-sdk` for `libs/sdk`, `@pops/app-<id>` for apps), because `pnpm --filter` exits 0 on zero matches and would silently run nothing. Every TS lane asserts `--filter` matches exactly one package.
- **maxdepth-1 unit discovery is deliberate.** The `pillars/*/app` members live at maxdepth 2 and collide on basename `app`, so they are excluded from `unit-quality.yml` and covered by the App Quality (own tests) + FE Quality (shell build) lanes instead. `assert-app-coverage` turns that exclusion into a gate.
- **Shared-root touch invalidates everything.** A change to the lockfile, base/build tsconfig, formatter/linter config, mise root, or Cargo root rebuilds **all** units, not just the changed subset.
- **Codegen and generated artefacts are drift-gated.** `generate:*` scripts, `module-registry/generated.ts`, the `contacts` OpenAPI spec, vendored contract snapshots, and the shell's nginx fallback conf must each match their committed form (`git diff --exit-code`).
- **Quality gates must pass before image publish.** Publish runs on the same push-to-main trigger; if a gated workflow fails on `main`, the deployer pins `POPS_IMAGE_TAG` rather than upgrading.
- **No deploy workflow in this repo** — Watchtower on the deploy host pulls new digests automatically.

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------- |
| Docs-only PR                                                           | `quality.yml` and the path-filtered siblings never trigger; `CI Gate` never reports; with `strict_required_status_checks_policy: false` a never-reported required check is non-blocking |
| A gated sibling still in flight when CI Gate fires                     | Reported as pending, not failed; the last sibling to complete re-triggers the gate for the authoritative verdict                                                                        |
| A re-run supersedes an earlier attempt at the same SHA                 | CI Gate keeps the newest run per gated workflow (`run_number`/`run_attempt`)                                                                                                            |
| `pnpm --filter` dir-name ≠ pkg-name skew                               | The "exactly one package" assertion fails loud instead of silently running nothing                                                                                                      |
| Data-only unit with no `src/` (e.g. `libs/locales`)                    | Lint step skips (nothing to lint); typecheck/test skip if the unit has no such script                                                                                                   |
| Source lib with no own `build` task (ui, navigation, overlay-ego)      | mise-task `Source:` gate skips the own-build step; its deps are still built via `^...` so its `.d.ts` resolve                                                                           |
| Rust pillar (`contacts`) carries no `package.json`                     | Invisible to pnpm discovery; covered by the Rust lane of `unit-quality.yml` (changed-only) and the whole-workspace `rust-quality.yml`                                                   |
| Manifest-less dir (`pillars/core`, `pillars/moltbot`, workspace stubs) | No `package.json`/`Cargo.toml [package]` → skipped by discovery                                                                                                                         |
| `better-sqlite3` native build under mise                               | mise's node bundles `node-gyp` but omits it from PATH; each install lane prepends npm's `node-gyp-bin` dir so the `prebuild-install                                                     |     | node-gyp rebuild` fallback works |
| oxfmt rules shift / husky bypassed                                     | Untouched files drift silently; the 6-hourly watchdog opens a single tracking issue and closes it once `main` is clean                                                                  |

## Acceptance Criteria

### Required gate

- [x] `quality.yml` runs root lint (oxlint `--type-aware`), format check (oxfmt), module boundaries (dependency-cruiser), and duplication (jscpd) as four discrete required jobs
- [x] `ci-gate.yml` aggregates the six gated workflows' conclusions at the head SHA via `workflow_run` and reports a single static `CI Gate` context that the ruleset requires
- [x] CI Gate treats path-filtered-out (absent) siblings as non-failing and only fails on an observed failure/cancelled/timed-out/startup-failure conclusion
- [x] CI Gate keeps the newest run per gated workflow at a SHA so a re-run supersedes an earlier attempt
- [x] `agent-review.yml` runs on every non-draft PR with two blocking isolation guards (`check-contract-isolation.mjs`, `check-lib-no-pillar-import.mjs`, each self-tested) plus an advisory LLM review that no-ops without `ANTHROPIC_API_KEY`

### Disk discovery

- [x] `_discover-units.yml` scans `pillars/*` + `libs/*` (maxdepth 1) and classifies each unit's lang from its manifest, emitting full + changed unit sets
- [x] A shared-root change (lockfile, base/build tsconfig, oxfmt/oxlint config, mise root, Cargo root) forces the changed set to all units
- [x] `assert-app-coverage` fails if any `pillars/*/app` member is not named `@pops/app-*` or not routed to both App Quality and FE Quality
- [x] Every TS lane asserts `pnpm --filter <pkg>` matches exactly one package and fails loud otherwise

### Per-unit quality

- [x] `unit-quality.yml` runs oxfmt-check, oxlint, dep-closure build, own-unit build (only when the unit owns a `build` task), typecheck, codegen drift, and test for every changed TS unit, and `fmt`/`clippy -D warnings`/build/test for every changed Rust unit
- [x] `app-quality.yml` runs each `@pops/app-*` frontend's own typecheck + test (preferring `test:coverage`) over a disk-discovered matrix
- [x] `fe-quality.yml` builds the shell SPA (compiling every app transitively), typechecks, tests, and gates the nginx fallback-conf for drift
- [x] `rust-quality.yml` runs the whole cargo workspace fmt/clippy/build/test and gates the `contacts` OpenAPI emission for drift
- [x] `registry-generated-quality.yml` regenerates `module-registry/src/generated.ts` and fails on diff

### Docker / schema / infra

- [x] `docker-build.yml` builds the builder stage of every `pillars/*/Dockerfile` (disk-discovered) and validates both compose files on PRs that touch them
- [x] `pillar-quality.yml` builds the full image of every pillar on push to `main`
- [x] `pillar-schema-coverage.yml` applies each pillar's migrations against a fresh DB and asserts table coverage, with a self-test that injects a fake table
- [x] `workflows-quality.yml` runs `yaml-lint` over `.github/workflows/*.yml` whenever any workflow changes
- [x] `infra-lint.yml` lints Litestream YAML on change

### Publishing / release / watchdog

- [x] `publish-images.yml` builds + pushes the full fleet to `ghcr.io/knoxio/pops-*` on every push to `main` and `v*` tags; pillar images are disk-discovered from the prod compose; a `workflow_dispatch only` input rebuilds a single image
- [x] `release.yml` (workflow_dispatch) computes semver, tags `vX.Y.Z`, and creates the GitHub Release
- [x] `format-drift-watchdog.yml` runs whole-tree `pnpm format:check` on `main` every 6h and opens/updates/closes a single tracking issue

### Cross-cutting rules

- [x] Path filters configured — workflows only trigger on relevant file changes; docs-only PRs are excluded from `quality.yml`
- [x] All workflows run on `ubuntu-latest` (no self-hosted runners)
- [x] A failing required workflow blocks PR merge via the `CI Gate` aggregator

## Out of Scope

- Auto-deployment to a server (Watchtower handles it; spec lives in homelab-infra PRD-095)
- The GHCR image contract, compose deployment artifact, secrets layout, and versioning (the [Application Packaging & GHCR Contract](../application-packaging/README.md) PRD)
- Multiple deployment environments, blue/green, or canary
- Playwright e2e in CI — the suite was written against the deleted tRPC monolith and is `workflow_dispatch`-only pending a REST rewrite (see [docs/ideas/cicd-pipelines.md](../../../../ideas/cicd-pipelines.md))
