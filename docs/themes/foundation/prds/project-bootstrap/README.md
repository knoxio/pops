# PRD: Project Bootstrap

> Theme: [Foundation](../../README.md)
> Status: Done

## Overview

The monorepo toolchain that every pillar and library is built on: package manager, task runner, tool-version pinning, TypeScript strict mode, the compiled-graph build, linting, formatting, and test frameworks. After bootstrap, `mise setup` installs everything and `mise dev` starts a working development environment.

The repository is a **federation of independent units**, not a build-graph monolith. There is no Turbo, no central build orchestrator, no `apps/`/`packages/` split. The two top-level workspace roots are:

- `pillars/*` — independent services (each owns its SQLite DB, serves a ts-rest+zod contract, self-registers with the `registry` pillar). Each pillar may also host a frontend SPA at `pillars/<id>/app` published as `@pops/app-<id>`.
- `libs/*` — shared libraries (the `@pops/pillar-sdk`, `@pops/ui`, `@pops/types`, `@pops/module-registry`, `@pops/settings`, etc.).

Each unit carries its **own** `mise.toml` defining its `build`/`typecheck`/`test`/`lint`/`dev` tasks. The root `mise.toml` orchestrates by **disk discovery + fan-out**, not by a compiled dependency graph it owns. This is the federation model: a unit is extractable to its own repo because it is self-describing.

## Data Model

No database work — this is tooling configuration. (Per-pillar SQLite databases are owned by each pillar, not bootstrapped here.)

## API Surface

No API work — this is tooling configuration.

## Toolchain

| Concern             | Tool                        | Where                                                                                 |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| Package manager     | pnpm (`10.32.1`, pinned)    | `pnpm-workspace.yaml` globs `pillars/*`, `pillars/*/*`, `libs/*`                      |
| Task runner         | mise                        | root `mise.toml` (orchestration) + one `mise.toml` per unit (tasks)                   |
| Tool versions       | mise `[tools]`              | node `24.5.0`, pnpm `10.32.1`, rust `stable` (CI overrides node → 22)                 |
| TS (type system)    | TypeScript strict           | `tsconfig.base.json` (shared) + per-unit `tsconfig.json` extends it                   |
| TS (compiled build) | `tsc -b` project references | `tsconfig.build.json` lists every compiled-lib + pillar reference                     |
| Linting             | oxlint (`--type-aware`)     | `.oxlintrc.json` (workspace-wide, single pass)                                        |
| Formatting          | oxfmt                       | `.oxfmtrc.json` (workspace-wide; includes import sorting)                             |
| Unit/integration    | Vitest                      | per-unit `vitest.config.ts`; root config covers `scripts/` only                       |
| E2E                 | Playwright                  | `pillars/shell/playwright.config.ts` + `pillars/shell/e2e/`                           |
| Component dev       | Storybook                   | `libs/ui/.storybook/`                                                                 |
| Rust pillars/libs   | Cargo workspace             | root `Cargo.toml` (members: `pillars/contacts`, `libs/pops-ai`, `libs/pops-settings`) |
| Git hooks           | husky                       | `.husky/pre-commit`, `.husky/pre-push` (runs `pnpm typecheck`)                        |

## Build & Task Orchestration

The root `mise.toml` does **not** model the dependency graph itself. It delegates in two ways:

1. **Compiled TS graph** — `mise build` runs `tsc -b tsconfig.build.json`, one ordered incremental pass over the project-reference graph. This replaces what Turbo's `^build` once did: TypeScript's own project references provide the topological ordering (a lib builds before the pillar that references it). Emitted `dist/` is gitignored.
2. **Source-unit fan-out** — `mise test`, `mise typecheck`, `mise dev` call the `run-all` wrapper, which discovers every unit on disk (`find pillars libs -maxdepth 1` plus the `pillars/*/app` frontends) and runs the named task in each. mise has no `--all`; this explicit matrix mirrors the CI discovery matrix.

The `run-all` source guard is load-bearing: mise merges configs **up** the tree, so running a task in a unit whose own `mise.toml` lacks it would resolve to the root task and recurse infinitely. `run-all` therefore only runs a unit's task when `mise tasks info` reports the task's `Source` as that unit's own `mise.toml` (locally defined, not inherited).

`mise typecheck` runs `tsc -b` (not `--noEmit`): on a composite graph, `tsc -b --noEmit` errors `TS6310` on a cold graph (no `.tsbuildinfo`). `tsc -b` type-checks during the incremental build and is cold-safe, which is what makes the pre-push hook pass on fresh clones and worktrees.

## Business Rules

- **TypeScript strict is mandatory** everywhere. `tsconfig.base.json` sets `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitReturns: true`. Every unit's `tsconfig.json` extends it.
- **No type-safety escape hatches.** `typescript/no-explicit-any` and `typescript/no-non-null-assertion` are `error`. `as any` and `as unknown as T` are forbidden. Fix the type, don't cast.
- **No lint suppression.** No `eslint-disable`/`ts-ignore` culture — fix the underlying issue. oxlint runs `--type-aware` so type-informed rules (e.g. `no-floating-promises`) are enforced.
- **Formatting is enforced, not advisory.** oxfmt is the single formatter (`format:check` gates CI). Import order is part of formatting (`@pops/` treated as internal).
- **Every workspace package resolves via pnpm.** A new unit is picked up by the `pillars/*` / `pillars/*/*` / `libs/*` globs and is immediately importable by its `@pops/*` name.
- **Node version is pinned via mise** so every agent and CI runner gets the same toolchain with no manual `nvm use`. `mise.ci.toml` (activated by `MISE_ENV=ci`) overrides node to 22; local pins 24.
- **Each unit is self-describing.** Its `mise.toml`, `tsconfig.json`, and (for pillars) contract/manifest make it extractable to its own repo. The root owns orchestration glue only.

## Edge Cases

| Case                            | Behaviour                                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New unit added                  | Add it under `pillars/` or `libs/` with its own `mise.toml`; the workspace globs and `run-all` fan-out pick it up automatically. If it is a compiled lib/pillar, add a reference to `tsconfig.build.json`. |
| New compiled lib changes        | `tsc -b` invalidates and rebuilds every downstream project reference in one incremental pass.                                                                                                              |
| Unit lacks a fanned-out task    | `run-all`'s source guard skips it (task is inherited from the root, not locally defined) — no infinite recursion.                                                                                          |
| Cold clone / fresh worktree     | `mise typecheck` uses `tsc -b` (not `--noEmit`) so it succeeds with no pre-existing `.tsbuildinfo`.                                                                                                        |
| Rust unit                       | Lives in the single Cargo workspace (`cargo build --workspace`); `mise build:all` builds the TS graph and the Rust workspace together.                                                                     |
| `scripts/` (root-owned tooling) | Has no per-unit `mise.toml`, so it is invisible to `run-all`; `mise test:scripts` runs it via the root `vitest.config.ts`.                                                                                 |

## Acceptance Criteria

### Package manager & workspace

- [x] pnpm workspace configured via `pnpm-workspace.yaml` listing `pillars/*`, `pillars/*/*`, `libs/*`
- [x] Root `package.json` (`@pops/monorepo`, private) with workspace-level scripts
- [x] `pnpm install` from root installs the whole dependency tree
- [x] Workspace units import each other by `@pops/*` package name
- [x] pnpm version pinned (`packageManager: pnpm@10.32.1`)

### mise (task runner + version pinning)

- [x] Root `mise.toml` exists
- [x] Node, pnpm, and rust versions pinned in `[tools]` (auto-installed on directory entry)
- [x] `mise.ci.toml` overrides the toolchain for CI (`MISE_ENV=ci`, node 22)
- [x] `mise dev` builds compiled-lib deps once then starts every unit's watcher in parallel
- [x] `mise dev:shell`, `mise dev:mcp`, `mise dev:storybook` start individual dev servers
- [x] `mise test`, `mise build`, `mise typecheck`, `mise lint` run across the federation
- [x] `mise tasks` lists all available tasks
- [x] `mise setup` (install deps + typecheck) bootstraps a fresh clone

### TypeScript

- [x] Shared `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`
- [x] Each unit extends the base config
- [x] `tsconfig.build.json` declares the composite project-reference graph for `tsc -b`
- [x] `as any` forbidden — `typescript/no-explicit-any: error`
- [x] Non-null assertions forbidden — `typescript/no-non-null-assertion: error`
- [x] `mise typecheck` is cold-safe (`tsc -b`, never `tsc -b --noEmit`)
- [x] `@pops/*` package-name resolution works across the workspace

### Lint & format

- [x] oxlint configured (`.oxlintrc.json`) and run workspace-wide with `--type-aware`
- [x] oxfmt configured (`.oxfmtrc.json`) as the single formatter, including import sorting
- [x] `mise lint` (oxlint) and `pnpm format:check` (oxfmt) gate the codebase
- [x] `typescript/no-floating-promises` enforced via type-aware linting

### Tests

- [x] Vitest configured per unit that has tests; `mise test` fans out across all units
- [x] `mise test:scripts` runs the root-owned `scripts/` suite
- [x] Playwright configured for shell e2e (`pillars/shell/playwright.config.ts` + `e2e/`)
- [x] Storybook runs for the UI library (`libs/ui`), with a story-coverage check in its test task

### Rust

- [x] Single Cargo workspace at repo root (`cargo build --workspace`)
- [x] `mise build:all` builds the TS compiled graph and the Rust workspace together

## Verification

A green bootstrap means all of the following pass from a fresh clone:

- `mise setup` (or `pnpm install`) resolves the whole workspace
- `mise dev` starts dev servers
- `mise build` builds the compiled TS graph; `mise build:rust` builds the Cargo workspace
- `mise test` runs every unit's suite; `mise test:scripts` runs the root suite
- `mise typecheck` passes cold
- `mise lint` and `pnpm format:check` pass
- Storybook starts (`mise dev:storybook`)
- Shell e2e tests pass

## Out of Scope

- UI components, design tokens, theming (separate foundation PRDs)
- Pillar application code and per-pillar databases (owned by each pillar)
- CI/CD pipelines and Docker images (the workflow definitions in `.github/workflows` and `infra/` are operated, not bootstrapped here)
- API mocking framework for tests — see [project-bootstrap idea](../../../../ideas/project-bootstrap.md)

## Notes on the toolchain that bootstrap deliberately does NOT use

This is a greenfield spec; it documents what exists, not a migration. For the record, the following are **not** part of the toolchain and must not be reintroduced:

- **Turbo / any build-graph orchestrator** — replaced by `tsc -b` project references (compiled ordering) plus mise disk-discovery fan-out (source units). The federation has no central graph owner.
- **ESLint flat config + Prettier** — replaced by oxlint + oxfmt (single workspace pass, faster, type-aware).
- **`apps/*` + `packages/*` workspace layout** — replaced by `pillars/*` and `libs/*`.
- **Shared `db:init` / `db:seed` / `db:clear` tasks** — there is no shared database. Each pillar migrates its own SQLite file at runtime. Only `mise db:seed:food` survives (a single pillar's dev fixture seeder).
