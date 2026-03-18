# ADR-005: Package Manager & Task Runner

## Status

Accepted (2026-03-18)

## Context

POPS currently uses:
- **Yarn v1** (Classic) as package manager
- **Turborepo** for workspace build orchestration
- **mise** for task running (42+ tasks) and Node version pinning (24.5.0)

As the project expands to 10+ workspace packages, the tooling should be evaluated.

### Package Manager: Yarn v1 → pnpm

Yarn v1 is in maintenance mode. pnpm is the modern standard for monorepos:
- Strict dependency resolution (no phantom deps)
- Faster installs via content-addressable store
- Native workspace support (`pnpm-workspace.yaml`)
- Better disk usage
- Active development

### Task Runner: mise → just (or keep mise)

mise currently serves two roles:
1. **Tool version management** — Pins Node 24.5.0
2. **Task runner** — 42+ tasks for dev, db, imports, docker, ansible

Options:
- **Keep mise** — Does both jobs. More complex config but fewer tools.
- **just + mise for versions only** — `just` handles task running (simpler, more transparent justfile). mise (or fnm/nvm) handles Node version only.
- **just + no version manager** — Pin Node version via Docker/CI only. Developers manage their own Node version.
- **just + Turbo** — `just` for orchestration and non-build tasks (db, docker, ansible). Turbo for build/test/lint caching across workspace packages.

## Decision

**pnpm + Turbo + mise.** Drop Yarn v1, keep everything else.

- **pnpm** replaces Yarn v1 as package manager. Strict dependency resolution prevents phantom deps across 10+ workspace packages. Native workspace support via `pnpm-workspace.yaml`.
- **Turbo** stays for build orchestration. Caching across workspace packages is its core value — matters more as package count grows.
- **mise** stays for both version management and task running. Auto Node pinning is valuable when AI agents are doing the development. No reason to introduce `just` as a third tool when mise already handles tasks.

## Migration Scope

1. Remove `yarn.lock`, generate `pnpm-lock.yaml`
2. Create `pnpm-workspace.yaml` (replaces `package.json` workspaces field)
3. Update root `package.json`: remove `packageManager: yarn`, add `packageManager: pnpm`
4. Update all scripts and docs referencing `yarn` → `pnpm`
5. Update CI pipelines
6. Update CLAUDE.md, mise.toml, and docs
7. Verify all workspace resolution works
8. Verify Turbo still caches correctly with pnpm

This should be done **before** Epic 1 (UI Library Extraction) so all new packages start on pnpm.
