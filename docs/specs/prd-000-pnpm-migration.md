# PRD-000: pnpm Migration

**Epic:** [00 — pnpm Migration](../themes/foundation/epics/00-pnpm-migration.md)
**Theme:** Foundation
**Status:** Approved
**ADR:** [005 — Package Manager & Task Runner](../architecture/adr-005-package-manager-and-task-runner.md)

## Problem Statement

POPS uses Yarn v1 (maintenance mode) as its package manager. As the project expands to 10+ workspace packages, pnpm's strict dependency resolution and native workspace support are needed. All subsequent Foundation work should start on pnpm.

## Goal

Replace Yarn v1 with pnpm. Zero code changes — only tooling, config, and docs.

## Requirements

### R1: Package Manager Swap

- Remove `yarn.lock`
- Generate `pnpm-lock.yaml` (via `pnpm import` to migrate existing lockfile, or fresh `pnpm install`)
- Create `pnpm-workspace.yaml` listing workspace packages:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/db-types'
  ```
- Update root `package.json`: replace `"packageManager": "yarn@1.22.22"` with pnpm equivalent
- Note: `packages/import-tools` is standalone (not in workspace) — verify it still works independently

### R2: Update All References

Every reference to `yarn` in the repo must be updated:
- `mise.toml` — all tasks that invoke `yarn`
- `CLAUDE.md` — all command examples
- `turbo.json` — verify pnpm compatibility (Turbo supports pnpm natively)
- `package.json` scripts across all workspaces (if any reference `yarn` directly)
- `infra/docker-compose.yml` — if any build steps use yarn
- Dockerfiles — if any exist with yarn commands
- CI pipelines — if any exist
- `docs/` — any references

### R3: Verify Everything Works

All of the following must pass after migration:
- `pnpm install` resolves all workspace packages
- `pnpm dev` / `mise dev` starts dev servers
- `pnpm build` / `mise build` builds all packages
- `pnpm test` / `mise test` runs all tests
- `pnpm typecheck` / `mise typecheck` passes
- `pnpm lint` / `mise lint` passes
- `pnpm format:check` passes
- Turbo caching works (`turbo build` caches correctly)
- Storybook starts
- E2E tests pass

## Out of Scope

- Code changes of any kind
- Changing Turbo configuration (beyond pnpm compatibility)
- Changing mise beyond `yarn` → `pnpm` references
- Adding new packages or workspace members

## Acceptance Criteria

1. `yarn.lock` deleted, `pnpm-lock.yaml` exists
2. `pnpm-workspace.yaml` exists and lists all workspace packages
3. Zero references to `yarn` remain in the repo (except historical git commits)
4. All verification checks in R3 pass
5. `packages/import-tools` works independently outside the workspace

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Migrate lockfile and workspace config
**As a** developer, **I want** pnpm installed and configured as the package manager **so that** all workspace packages resolve correctly.

**Acceptance criteria:**
- `yarn.lock` removed
- `pnpm-lock.yaml` generated
- `pnpm-workspace.yaml` created with correct package list
- Root `package.json` updated with pnpm as `packageManager`
- `pnpm install` succeeds with no errors
- All workspace packages resolvable (`pnpm ls` shows correct tree)
- `packages/import-tools` works independently

### US-2: Update tooling and documentation
**As a** developer (or agent), **I want** all references to `yarn` replaced with `pnpm` **so that** I can follow any doc or task without confusion.

**Acceptance criteria:**
- `mise.toml` updated — all tasks use `pnpm`
- `CLAUDE.md` updated — all examples use `pnpm`
- Dockerfiles / docker-compose updated if applicable
- `docs/` updated
- Grep for `yarn` returns zero hits (excluding `pnpm-lock.yaml` internals and git history)
- Turbo runs correctly with pnpm
- Storybook starts
- E2E tests pass
